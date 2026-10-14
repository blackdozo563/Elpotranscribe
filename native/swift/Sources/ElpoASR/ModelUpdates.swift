import Foundation
import CryptoKit

struct ModelSource: Codable, Equatable, Sendable {
    let repository: String
    let revision: String
    let files: [String: String]
}
struct ModelUpdate: Codable, Sendable {
    let engine: String
    let status: String
    let installedRevision: String?
    let latestRevision: String?
    let checkedAt: UInt64
    let error: String?
}
func modelRepositories(_ engine: String) throws -> [String] {
    switch engine {
    case "ultra": return ["FluidInference/parakeet-ultra-coreml"]
    case "whisper-base", "whisper-small", "whisper-turbo": return ["ggerganov/whisper.cpp"]
    case "qwen-0.6b": return ["mlx-community/Qwen3-ASR-0.6B-4bit", "mlx-community/Qwen3-ForcedAligner-0.6B-4bit"]
    case "qwen-1.7b": return ["mlx-community/Qwen3-ASR-1.7B-4bit", "mlx-community/Qwen3-ForcedAligner-0.6B-4bit"]
    default: throw Failure(message: "Catalogue de modèles inconnu")
    }
}
func parseModelSource(_ value: [String: Any], repository: String, engine: String) throws -> ModelSource {
    guard let revision = value["sha"] as? String, revision.range(of: #"^[a-f0-9]{40,64}$"#, options: .regularExpression) != nil,
          let siblings = value["siblings"] as? [[String: Any]] else { throw Failure(message: "Métadonnées de version absentes") }
    var files: [String: String] = [:]
    for item in siblings {
        guard let name = item["rfilename"] as? String else { continue }
        let accepted: Bool
        if engine.hasPrefix("whisper-") {
            let model = engine == "whisper-turbo" ? "large-v3-turbo-q5_0" : engine.replacingOccurrences(of: "whisper-", with: "")
            accepted = name == "ggml-" + model + ".bin"
        }
        else { accepted = name.contains(".mlmodelc/") || ["json", "safetensors", "bin", "zip", "txt"].contains(URL(fileURLWithPath: name).pathExtension) }
        guard accepted, !name.uppercased().hasPrefix("LICENSE") else { continue }
        if let lfs = item["lfs"] as? [String: Any], let hash = lfs["sha256"] as? String, hash.count == 64 { files[name] = "sha256:" + hash }
        else if let hash = item["blobId"] as? String, hash.count == 40 { files[name] = "git:" + hash }
    }
    guard !files.isEmpty else { throw Failure(message: "Aucun fichier de modèle versionné dans le catalogue") }
    return ModelSource(repository: repository, revision: revision, files: files)
}
func fetchModelSource(repository: String, engine: String) async throws -> ModelSource {
    let url = URL(string: "https://huggingface.co/api/models/" + repository + "?blobs=true")!
    var request = URLRequest(url: url); request.timeoutInterval = 15
    request.cachePolicy = .reloadIgnoringLocalCacheData
    let (data, response) = try await URLSession.shared.data(for: request)
    guard (response as? HTTPURLResponse)?.statusCode == 200,
          let object = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { throw Failure(message: "Catalogue de versions inaccessible. Le modèle installé reste utilisable hors ligne.") }
    return try parseModelSource(object, repository: repository, engine: engine)
}
func latestModelSources(_ engine: String) async throws -> [ModelSource] {
    let repos = try modelRepositories(engine)
    var sources: [ModelSource] = []
    for repo in repos { sources.append(try await fetchModelSource(repository: repo, engine: engine)) }
    return sources
}
func sameModelAssets(_ a: [ModelSource], _ b: [ModelSource]) -> Bool {
    a.count == b.count && zip(a,b).allSatisfy { pair in pair.0.repository == pair.1.repository && pair.0.files == pair.1.files }
}
func modelMarker(root: URL, engine: String) -> URL { root.appendingPathComponent(engine == "ultra" ? "verified.json" : engine + ".json") }
func checkModelUpdates(root: URL) async throws -> [ModelUpdate] {
    let engines = ["ultra", "whisper-base", "whisper-small", "whisper-turbo", "qwen-0.6b", "qwen-1.7b"].filter { FileManager.default.fileExists(atPath: modelMarker(root: root, engine: $0).path) }
    // Independent metadata requests share no model state and do not load weights.
    return await withTaskGroup(of: ModelUpdate.self) { group in
        for engine in engines {
            group.addTask {
                let checked = UInt64(Date().timeIntervalSince1970 * 1000)
                do {
                    let installed = try JSONDecoder().decode(Manifest.self, from: Data(contentsOf: modelMarker(root: root, engine: engine)))
                    let latest = try await latestModelSources(engine)
                    let status = installed.sources.map { sameModelAssets($0, latest) ? "current" : "available" } ?? "unknown"
                    return ModelUpdate(engine: engine, status: status, installedRevision: installed.sources?.map(\.revision).joined(separator: " / "), latestRevision: latest.map(\.revision).joined(separator: " / "), checkedAt: checked, error: nil)
                } catch { return ModelUpdate(engine: engine, status: "error", installedRevision: nil, latestRevision: nil, checkedAt: checked, error: error.localizedDescription) }
            }
        }
        var result: [ModelUpdate] = []
        for await update in group { result.append(update) }
        return result.sorted { $0.engine < $1.engine }
    }
}
func installedDirectory(root: URL, engine: String, manifest: Manifest) throws -> URL {
    let folder = engine == "ultra" ? "parakeet-ultra" : engine
    guard let relative = manifest.directory else { return root.appendingPathComponent(folder) }
    let parts = relative.split(separator: "/", omittingEmptySubsequences: false)
    guard parts.count == 2, parts[0].hasPrefix("installed-" + engine + "-"), !parts[0].contains(".."), parts[1] == folder else { throw Failure(message: "Chemin du modèle installé invalide") }
    return root.appendingPathComponent(relative)
}
func activateModel(prepared: URL, root: URL, engine: String, manifest: Manifest) throws {
    let manager = FileManager.default
    let marker = modelMarker(root: root, engine: engine)
    let previous = (try? Data(contentsOf: marker)).flatMap { try? JSONDecoder().decode(Manifest.self, from: $0) }
    let container = "installed-" + engine + "-" + UUID().uuidString
    let folder = engine == "ultra" ? "parakeet-ultra" : engine
    let destination = root.appendingPathComponent(container).appendingPathComponent(folder)
    try manager.createDirectory(at: destination.deletingLastPathComponent(), withIntermediateDirectories: true)
    var committed = manifest; committed.directory = container + "/" + folder
    // An atomic manifest selects the initialized weights. The previous manifest
    // and directory stay valid even if download, activation or the process fails.
    do {
        try manager.moveItem(at: prepared, to: destination)
        try JSONEncoder().encode(committed).write(to: marker, options: .atomic)
    } catch {
        try? manager.removeItem(at: destination.deletingLastPathComponent())
        throw error
    }
    if let previous, let old = try? installedDirectory(root: root, engine: engine, manifest: previous), old != destination {
        try? manager.removeItem(at: previous.directory == nil ? old : old.deletingLastPathComponent())
    }
}

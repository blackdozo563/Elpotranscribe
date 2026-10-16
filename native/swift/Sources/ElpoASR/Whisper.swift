import Foundation
import AVFoundation
import CryptoKit
import CWhisper

let whisperRevision = "2eeeba56e9edd762b4b38467bab96c2517163158"
struct WhisperModel {
    let name: String
    static func get(_ engine: String) throws -> WhisperModel {
        switch engine {
        case "whisper-turbo": return WhisperModel(name: "large-v3-turbo-q5_0")
        default: throw Failure(message: "Moteur Whisper inconnu")
        }
    }
}

func installWhisper(root: URL, engine: String) async throws {
    let model = try WhisperModel.get(engine)
    let sources = try await latestModelSources(engine)
    let source = sources[0]
    let staging = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    try FileManager.default.createDirectory(at: staging, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: staging) }
    let filename = "ggml-" + model.name + ".bin"
    guard let digest = source.files[filename], digest.hasPrefix("sha256:") else { throw Failure(message: "Empreinte SHA-256 du modèle absente du catalogue") }
    let url = URL(string: "https://huggingface.co/ggerganov/whisper.cpp/resolve/\(source.revision)/\(filename)")!
    let progress = InstallProgress(engine: engine)
    let session = URLSession(configuration: .default, delegate: progress, delegateQueue: nil)
    defer { session.finishTasksAndInvalidate() }
    let (temporary, response) = try await session.download(from: url)
    progress.validate()
    defer { try? FileManager.default.removeItem(at: temporary) }
    guard (response as? HTTPURLResponse)?.statusCode == 200 else { throw Failure(message: "Téléchargement Whisper refusé") }
    guard "sha256:" + (try hashFile(temporary)) == digest else { throw Failure(message: "Empreinte du téléchargement Whisper incorrecte") }
    let weights = staging.appendingPathComponent("model.bin")
    try FileManager.default.moveItem(at: temporary, to: weights)
    let verified = weights.path.withCString { elpo_whisper_validate($0) }
    guard verified == 0 else { throw Failure(message: "Nouvelle version Whisper incompatible ; modèle précédent conservé") }
    let manifest = Manifest(sdk: whisperRevision, files: try modelHashes(staging), sources: sources)
    try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
    try activateModel(prepared: staging, root: root, engine: engine, manifest: manifest)
}

final class WhisperTokens {
    var words: [Word] = []
    var bytes = Data()
    var start: Int64 = -1
    var end: Int64 = -1
    var invalid = false
    func flush() {
        guard !bytes.isEmpty else { return }
        guard let decoded = String(data: bytes, encoding: .utf8) else { invalid = true; bytes.removeAll(); return }
        let text = decoded.trimmingCharacters(in: .whitespacesAndNewlines)
        if !text.isEmpty {
            if start >= 0 && end > start { words.append(Word(startMs: UInt64(start), endMs: UInt64(end), text: text)) }
            else { invalid = true }
        }
        bytes.removeAll(); start = -1; end = -1
    }
    func append(_ data: Data, start: Int64, end: Int64) {
        // A later token must not hide a missing first token's timestamp.
        if start < 0 || end < start { invalid = true }
        // Token strings can split UTF-8 characters; decode only whole words.
        if data.first == 32 { flush() }
        if self.start < 0 { self.start = start }
        self.end = max(self.end, end)
        bytes.append(data)
    }
}

final class WhisperOutput {
    let tokens = WhisperTokens()
    var segments: [Word] = []
    var needsNext = false
    func appendSegment(_ data: Data, start: Int64, end: Int64) {
        guard let decoded = String(data: data, encoding: .utf8) else { return }
        let text = decoded.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        // Keep only model-provided nonnegative bounds. An inverted interval
        // contributes its real outer endpoints, never interpolated word times.
        let points = [start, end].filter { $0 >= 0 }
        guard let low = points.min(), let high = points.max() else {
            // Retain text with a neighbouring passage when neither bound exists.
            if let previous = segments.last {
                segments[segments.count - 1] = Word(startMs: previous.startMs, endMs: previous.endMs, text: previous.text + " " + text)
            } else {
                pendingText += (pendingText.isEmpty ? "" : " ") + text
            }
            return
        }
        let invalid = end <= start
        let segment = Word(startMs: UInt64(low), endMs: UInt64(high), text: (pendingText.isEmpty ? "" : pendingText + " ") + text)
        pendingText = ""
        if let previous = segments.last,
           needsNext || invalid || previous.endMs > segment.startMs {
            segments[segments.count - 1] = Word(startMs: min(previous.startMs, segment.startMs), endMs: max(previous.endMs, segment.endMs), text: previous.text + " " + segment.text)
            needsNext = segments.last!.endMs == segments.last!.startMs
        } else {
            segments.append(segment)
            needsNext = invalid
        }
    }
    var pendingText = ""
    func result() throws -> (units: [Word], granularity: String) {
        tokens.flush()
        // Passages are the primary SRT source. Tokens are optional enrichment.
        if !segments.isEmpty { return (segments, "segment") }
        if !tokens.invalid, !tokens.words.isEmpty { return (tokens.words, "word") }
        throw Failure(message: "Whisper n’a fourni aucun passage. Aucun temps artificiel n’a été créé.")
    }

}

func transcribeWhisper(root: URL, engine: String, source: String, language: String?, prompt: String? = nil) throws {
    _ = try WhisperModel.get(engine)
    let manifest = try JSONDecoder().decode(Manifest.self, from: Data(contentsOf: root.appendingPathComponent(engine + ".json")))
    let directory = try installedDirectory(root: root, engine: engine, manifest: manifest)
    guard manifest.sdk == whisperRevision, manifest.files == (try modelHashes(directory)) else { throw Failure(message: "Intégrité Whisper incorrecte. Réinstallez le modèle.") }
    let temporary = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".f32")
    defer { try? FileManager.default.removeItem(at: temporary) }
    let started = Date()
    let count = try floatAudio(URL(fileURLWithPath: source), destination: temporary)
    guard count <= Int32.max else { throw Failure(message: "Audio trop long pour cette version Whisper ; divisez le fichier.") }
    let audio = try Data(contentsOf: temporary, options: .alwaysMapped)
    var promptCount: Int32 = 0; var promptUsed: Int32 = 0; var promptLimit: Int32 = 224
    let output = WhisperOutput()
    let status = audio.withUnsafeBytes { samples in
        directory.appendingPathComponent("model.bin").path.withCString { model in
            (language ?? "auto").withCString { code in
                (prompt ?? "").withCString { initialPrompt in
                elpo_whisper(model, code, samples.bindMemory(to: Float.self).baseAddress, Int32(count), Int32(min(4, ProcessInfo.processInfo.activeProcessorCount)), initialPrompt, &promptCount, &promptUsed, &promptLimit, { user, text, length, start, end in
                    guard let user, let text else { return }
                    Unmanaged<WhisperOutput>.fromOpaque(user).takeUnretainedValue().tokens.append(Data(bytes: text, count: Int(length)), start: start, end: end)
                }, { user, text, length, start, end in
                    guard let user, let text else { return }
                    Unmanaged<WhisperOutput>.fromOpaque(user).takeUnretainedValue().appendSegment(Data(bytes: text, count: Int(length)), start: start, end: end)
                }, Unmanaged.passUnretained(output).toOpaque())
                }
            }
        }
    }
    guard status == 0 else { throw Failure(message: "Échec whisper.cpp (\(status))") }
    let result = try output.result()
    emit(["promptTokenCount": promptCount, "promptTokensUsed": promptUsed, "promptTokenLimit": promptLimit, "engine": engine, "modelVersion": manifest.sources?.map(\.revision).joined(separator: " / ") ?? whisperRevision, "text": result.units.map(\.text).joined(separator: " "), "durationMs": count / 16, "processingTimeMs": try milliseconds(Date().timeIntervalSince(started)), "timingGranularity": result.granularity, "words": tokensJSON(output.tokens), "segments": try JSONSerialization.jsonObject(with: JSONEncoder().encode(output.segments))])
}

private func tokensJSON(_ tokens: WhisperTokens) -> Any {
    guard !tokens.invalid else { return [[String: Any]]() }
    return (try? JSONSerialization.jsonObject(with: JSONEncoder().encode(tokens.words))) ?? [[String: Any]]()
}

func whisperPromptInfo(root: URL, engine: String, prompt: String) throws {
    let manifest = try JSONDecoder().decode(Manifest.self, from: Data(contentsOf: root.appendingPathComponent(engine + ".json")))
    let directory = try installedDirectory(root: root, engine: engine, manifest: manifest)
    guard manifest.sdk == whisperRevision, manifest.files == (try modelHashes(directory)) else { throw Failure(message: "Intégrité Whisper incorrecte. Réinstallez le modèle.") }
    var count: Int32 = 0; var used: Int32 = 0; var limit: Int32 = 224
    let status = directory.appendingPathComponent("model.bin").path.withCString { model in
        prompt.withCString { text in elpo_whisper_prompt_info(model, text, &count, &used, &limit) }
    }
    guard status == 0 else { throw Failure(message: "Comptage des tokens Whisper impossible.") }
    emit(["count":count,"used":used,"limit":limit,"truncated":count > used])
}

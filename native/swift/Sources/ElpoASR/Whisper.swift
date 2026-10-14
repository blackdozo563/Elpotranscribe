import Foundation
import AVFoundation
import CryptoKit
import CWhisper

let whisperRevision = "2eeeba56e9edd762b4b38467bab96c2517163158"
struct WhisperModel {
    let name: String
    static func get(_ engine: String) throws -> WhisperModel {
        switch engine {
        case "whisper-base": return WhisperModel(name: "base")
        case "whisper-small": return WhisperModel(name: "small")
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
    let (temporary, response) = try await URLSession.shared.download(from: url)
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
    var invalidSegments = false
    func appendSegment(_ data: Data, start: Int64, end: Int64) {
        guard let decoded = String(data: data, encoding: .utf8) else { invalidSegments = true; return }
        let text = decoded.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        guard start >= 0, end > start else { invalidSegments = true; return }
        segments.append(Word(startMs: UInt64(start), endMs: UInt64(end), text: text))
    }
    func result() throws -> (units: [Word], granularity: String) {
        tokens.flush()
        if !tokens.invalid, !tokens.words.isEmpty { return (tokens.words, "word") }
        guard !invalidSegments, !segments.isEmpty else { throw Failure(message: "Whisper n’a fourni ni mots ni passages avec des horodatages valides. Réessayez avec Parakeet ; aucun temps artificiel n’a été créé.") }
        return (segments, "segment")
    }
}

func transcribeWhisper(root: URL, engine: String, source: String, language: String?) throws {
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
    let output = WhisperOutput()
    let status = audio.withUnsafeBytes { samples in
        directory.appendingPathComponent("model.bin").path.withCString { model in
            (language ?? "auto").withCString { code in
                elpo_whisper(model, code, samples.bindMemory(to: Float.self).baseAddress, Int32(count), Int32(min(4, ProcessInfo.processInfo.activeProcessorCount)), { user, text, length, start, end in
                    guard let user, let text else { return }
                    Unmanaged<WhisperOutput>.fromOpaque(user).takeUnretainedValue().tokens.append(Data(bytes: text, count: Int(length)), start: start, end: end)
                }, { user, text, length, start, end in
                    guard let user, let text else { return }
                    Unmanaged<WhisperOutput>.fromOpaque(user).takeUnretainedValue().appendSegment(Data(bytes: text, count: Int(length)), start: start, end: end)
                }, Unmanaged.passUnretained(output).toOpaque())
            }
        }
    }
    guard status == 0 else { throw Failure(message: "Échec whisper.cpp (\(status))") }
    let result = try output.result()
    let units = try JSONSerialization.jsonObject(with: JSONEncoder().encode(result.units))
    emit(["engine": engine, "modelVersion": manifest.sources?.map(\.revision).joined(separator: " / ") ?? whisperRevision, "text": result.units.map(\.text).joined(separator: " "), "durationMs": count / 16, "processingTimeMs": try milliseconds(Date().timeIntervalSince(started)), "timingGranularity": result.granularity, "words": result.granularity == "word" ? units : ([[String: Any]]()), "segments": try JSONSerialization.jsonObject(with: JSONEncoder().encode(output.segments))])
}

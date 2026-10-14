import Foundation
import AVFoundation
import CryptoKit
import CWhisper

let whisperRevision = "2eeeba56e9edd762b4b38467bab96c2517163158"
struct WhisperModel {
    let name: String
    let sha1: String
    static func get(_ engine: String) throws -> WhisperModel {
        switch engine {
        case "whisper-base": return WhisperModel(name: "base", sha1: "465707469ff3a37a2b9b8d8f89f2f99de7299dac")
        case "whisper-small": return WhisperModel(name: "small", sha1: "55356645c2b361a969dfd0ef2c5a50d530afd8d5")
        default: throw Failure(message: "Moteur Whisper inconnu")
        }
    }
}

func installWhisper(root: URL, engine: String) async throws {
    let model = try WhisperModel.get(engine)
    let directory = root.appendingPathComponent(engine, isDirectory: true)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    let url = URL(string: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-\(model.name).bin")!
    let (temporary, response) = try await URLSession.shared.download(from: url)
    defer { try? FileManager.default.removeItem(at: temporary) }
    guard (response as? HTTPURLResponse)?.statusCode == 200 else { throw Failure(message: "Téléchargement Whisper refusé") }
    let handle = try FileHandle(forReadingFrom: temporary)
    defer { try? handle.close() }
    // Legacy SHA-1 is the upstream whisper.cpp file checksum, checked in addition
    // to HTTPS. Our local manifest uses SHA-256 and is rechecked offline.
    var hash = Insecure.SHA1()
    while let bytes = try handle.read(upToCount: 1_048_576), !bytes.isEmpty { hash.update(data: bytes) }
    guard hash.finalize().map({ String(format: "%02x", $0) }).joined() == model.sha1 else {
        throw Failure(message: "Empreinte du téléchargement Whisper incorrecte")
    }
    let destination = directory.appendingPathComponent("model.bin")
    // Keep a previously installed model intact if download/verification fails.
    if FileManager.default.fileExists(atPath: destination.path) {
        _ = try FileManager.default.replaceItemAt(destination, withItemAt: temporary)
    } else { try FileManager.default.moveItem(at: temporary, to: destination) }
    let manifest = Manifest(sdk: whisperRevision, files: try modelHashes(directory))
    try JSONEncoder().encode(manifest).write(to: root.appendingPathComponent(engine + ".json"), options: .atomic)
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

func transcribeWhisper(root: URL, engine: String, source: String, language: String?) throws {
    _ = try WhisperModel.get(engine)
    let directory = root.appendingPathComponent(engine, isDirectory: true)
    let manifest = try JSONDecoder().decode(Manifest.self, from: Data(contentsOf: root.appendingPathComponent(engine + ".json")))
    guard manifest.sdk == whisperRevision, manifest.files == (try modelHashes(directory)) else { throw Failure(message: "Intégrité Whisper incorrecte. Réinstallez le modèle.") }
    let temporary = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".f32")
    defer { try? FileManager.default.removeItem(at: temporary) }
    let started = Date()
    let count = try floatAudio(URL(fileURLWithPath: source), destination: temporary)
    let audio = try Data(contentsOf: temporary, options: .alwaysMapped)
    let tokens = WhisperTokens()
    let status = audio.withUnsafeBytes { samples in
        directory.appendingPathComponent("model.bin").path.withCString { model in
            (language ?? "auto").withCString { code in
                elpo_whisper(model, code, samples.bindMemory(to: Float.self).baseAddress, Int32(count), Int32(min(4, ProcessInfo.processInfo.activeProcessorCount)), { user, text, length, start, end in
                    guard let user, let text else { return }
                    Unmanaged<WhisperTokens>.fromOpaque(user).takeUnretainedValue().append(Data(bytes: text, count: Int(length)), start: start, end: end)
                }, Unmanaged.passUnretained(tokens).toOpaque())
            }
        }
    }
    tokens.flush()
    guard status == 0 else { throw Failure(message: "Échec whisper.cpp (\(status))") }
    guard !tokens.invalid, !tokens.words.isEmpty else { throw Failure(message: "Whisper n’a pas fourni de mots horodatés exploitables ; aucun temps inventé") }
    let words = try JSONSerialization.jsonObject(with: JSONEncoder().encode(tokens.words))
    emit(["engine": engine, "modelVersion": whisperRevision, "text": tokens.words.map(\.text).joined(separator: " "), "durationMs": count / 16, "processingTimeMs": try milliseconds(Date().timeIntervalSince(started)), "words": words])
}

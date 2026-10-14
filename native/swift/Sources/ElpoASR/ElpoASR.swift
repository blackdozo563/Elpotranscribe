import Foundation
import AVFoundation
import CryptoKit
import FluidAudio

struct Request: Decodable { let action: String; let models: String?; let source: String?; let language: String? }
struct Word: Codable { let startMs: UInt64; let endMs: UInt64; let text: String }
struct Failure: LocalizedError { let message: String; var errorDescription: String? { message } }
struct Manifest: Codable { let sdk: String; let files: [String: String] }
let sdkRevision = "224de0fb3c304b41bbae24e85e1801900865ff3e"
func emit(_ value: Any) {
    if let data = try? JSONSerialization.data(withJSONObject: value, options: [.sortedKeys]), let line = String(data: data, encoding: .utf8) { print(line) }
}
func hashFile(_ url: URL) throws -> String {
    let handle = try FileHandle(forReadingFrom: url); defer { try? handle.close() }
    var hash = SHA256()
    while let data = try handle.read(upToCount: 1_048_576), !data.isEmpty { hash.update(data: data) }
    return hash.finalize().map { String(format: "%02x", $0) }.joined()
}
func modelHashes(_ directory: URL) throws -> [String: String] {
    guard let files = FileManager.default.enumerator(at: directory, includingPropertiesForKeys: [.isRegularFileKey, .isSymbolicLinkKey]) else { throw Failure(message: "Modèle absent") }
    var result: [String: String] = [:]
    for case let file as URL in files {
        let values = try file.resourceValues(forKeys: [.isRegularFileKey, .isSymbolicLinkKey])
        if values.isSymbolicLink == true { throw Failure(message: "Lien symbolique inattendu dans le modèle") }
        if values.isRegularFile == true { result[String(file.path.dropFirst(directory.path.count + 1))] = try hashFile(file) }
    }
    guard !result.isEmpty else { throw Failure(message: "Modèle vide") }; return result
}
func milliseconds(_ seconds: Double) throws -> UInt64 {
    guard seconds.isFinite, seconds >= 0, seconds < 360_000 else { throw Failure(message: "Horodatage du moteur invalide") }
    return UInt64((seconds * 1000).rounded())
}
func probe(_ path: String) throws -> UInt64 {
    let audio = try AVAudioFile(forReading: URL(fileURLWithPath: path))
    guard audio.length > 0, audio.processingFormat.sampleRate > 0 else { throw Failure(message: "Audio vide ou corrompu") }
    // Decode a bounded first buffer too: a readable container alone is insufficient.
    guard let buffer = AVAudioPCMBuffer(pcmFormat: audio.processingFormat, frameCapacity: 4096) else { throw Failure(message: "Format audio incompatible") }
    try audio.read(into: buffer, frameCount: 4096)
    guard buffer.frameLength > 0 else { throw Failure(message: "Aucun échantillon audio décodable") }
    return try milliseconds(Double(audio.length) / audio.processingFormat.sampleRate)
}
@main struct ElpoASR {
    static func main() async {
        // The parent kills this single helper process on cancellation, releasing Core ML resources.
        let pressure = DispatchSource.makeMemoryPressureSource(eventMask: [.critical], queue: .global())
        pressure.setEventHandler { emit(["error": "Pression mémoire critique. Traitement arrêté pour protéger le Mac."]); exit(2) }
        pressure.resume(); defer { pressure.cancel() }
        do {
            #if !arch(arm64)
            throw Failure(message: "Ce moteur nécessite un Mac Apple Silicon ARM64")
            #endif
            let request = try JSONDecoder().decode(Request.self, from: FileHandle.standardInput.readDataToEndOfFile())
            if request.action == "probe" {
                guard let source = request.source else { throw Failure(message: "Audio absent") }
                emit(["durationMs": try probe(source)]); return
            }
            guard let path = request.models else { throw Failure(message: "Dossier du modèle absent") }
            let root = URL(fileURLWithPath: path, isDirectory: true)
            let directory = root.appendingPathComponent("parakeet-ultra-coreml", isDirectory: true)
            let marker = root.appendingPathComponent("verified.json")
            if request.action == "install" {
                try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
                // Explicit installation is the only operation allowed to access the model network.
                ModelHub.offlineMode = false
                let models = try await AsrModels.downloadAndLoad(to: directory, version: .ultra)
                let manager = AsrManager(); try await manager.loadModels(models); await manager.cleanup()
                let manifest = Manifest(sdk: sdkRevision, files: try modelHashes(directory))
                try JSONEncoder().encode(manifest).write(to: marker, options: .atomic)
                emit(["installed": true, "engine": "Parakeet Ultra"]); return
            }
            guard request.action == "transcribe", let source = request.source else { throw Failure(message: "Commande inconnue") }
            guard ProcessInfo.processInfo.physicalMemory >= 7_500_000_000 else { throw Failure(message: "Au moins 8 Go de mémoire unifiée sont requis") }
            let manifest = try JSONDecoder().decode(Manifest.self, from: Data(contentsOf: marker))
            guard manifest.sdk == sdkRevision, manifest.files == (try modelHashes(directory)) else { throw Failure(message: "Intégrité du modèle non vérifiée. Réinstallez-le.") }
            ModelHub.offlineMode = true
            let models = try await AsrModels.load(from: directory, version: .ultra)
            let manager = AsrManager(); try await manager.loadModels(models)
            var decoder = try TdtDecoderState(decoderLayers: AsrModelVersion.ultra.decoderLayers)
            let language: Language?
            if let code = request.language, code != "auto" {
                guard ["fr", "en", "es", "de", "it", "pt"].contains(code), let value = Language(rawValue: code) else { throw Failure(message: "Langue non prise en charge par ce moteur") }
                language = value
            } else { language = nil }
            // Disk-backed processing bounds memory for long recordings; the SDK preserves chunk offsets.
            let result = try await manager.transcribeDiskBacked(URL(fileURLWithPath: source), decoderState: &decoder, language: language)
            let timings = buildWordTimings(from: result.tokenTimings ?? [])
            guard !result.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, !timings.isEmpty else { throw Failure(message: "Aucune parole horodatée détectée") }
            let words = try timings.map { Word(startMs: try milliseconds($0.startTime), endMs: try milliseconds($0.endTime), text: $0.word) }
            await manager.cleanup()
            let data = try JSONEncoder().encode(words)
            emit(["engine": "Parakeet Ultra", "modelVersion": sdkRevision, "text": result.text, "durationMs": try milliseconds(result.duration), "processingTimeMs": try milliseconds(result.processingTime), "words": try JSONSerialization.jsonObject(with: data)])
        } catch { emit(["error": error.localizedDescription]); exit(1) }
    }
}

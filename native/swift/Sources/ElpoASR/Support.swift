import Darwin
import Foundation
import AVFoundation
import CryptoKit

struct Request: Decodable { let action: String; let models: String?; let source: String?; let language: String?; let engine: String?; let whisperPrompt: String? }
struct Word: Codable { let startMs: UInt64; let endMs: UInt64; let text: String }
struct Failure: LocalizedError { let message: String; var errorDescription: String? { message } }
struct Manifest: Codable, Sendable { let sdk: String; let files: [String: String]; var sources: [ModelSource]? = nil; var directory: String? = nil }
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
func modelHashes(_ requestedDirectory: URL) throws -> [String: String] {
    let directory = requestedDirectory.resolvingSymlinksInPath().standardizedFileURL
    guard let files = FileManager.default.enumerator(at: directory, includingPropertiesForKeys: [.isRegularFileKey, .isSymbolicLinkKey]) else { throw Failure(message: "Modèle absent") }
    var result: [String: String] = [:]
    for case let file as URL in files {
        let values = try file.resourceValues(forKeys: [.isRegularFileKey, .isSymbolicLinkKey])
        if values.isSymbolicLink == true { throw Failure(message: "Lien symbolique inattendu dans le modèle") }
        if values.isRegularFile == true {
            // macOS may enumerate /private/var while the root URL uses /var.
            // Normalize both sides before deriving the relative asset name.
            let canonical = file.resolvingSymlinksInPath().standardizedFileURL
            let base = directory.pathComponents
            let components = canonical.pathComponents
            guard components.count > base.count, Array(components.prefix(base.count)) == base else { throw Failure(message: "Chemin de fichier hors du modèle") }
            let relative = components.dropFirst(base.count).joined(separator: "/")
            result[relative] = try hashFile(canonical)
        }
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

func requirePhysicalMemory(engine: String, bytes: UInt64) throws {
    guard bytes >= 7_500_000_000 else {
        let name = engine == "whisper-turbo" ? "Whisper Turbo" : "ce moteur"
        throw Failure(message: "Mémoire physique insuffisante pour \(name) : au moins 8 Go de mémoire unifiée sont nécessaires.")
    }
}

// This lock is held by the helper itself, including when invoked by the local
// benchmark. Process exit releases it even if the caller is interrupted.
final class ModelLease {
    private var descriptor: Int32 = -1
    init(root: URL) throws {
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        descriptor = Darwin.open(root.appendingPathComponent(".inference.lock").path, O_CREAT | O_RDWR, mode_t(0o600))
        guard descriptor >= 0 else { throw Failure(message: "Impossible de verrouiller le dossier des modèles.") }
        guard Darwin.flock(descriptor, LOCK_EX | LOCK_NB) == 0 else {
            Darwin.close(descriptor); descriptor = -1
            throw Failure(message: "Un autre traitement local utilise déjà les modèles. Attendez sa fin avant de continuer.")
        }
    }
    func release() {
        if descriptor >= 0 { _ = Darwin.flock(descriptor, LOCK_UN); Darwin.close(descriptor); descriptor = -1 }
    }
    deinit { release() }
}

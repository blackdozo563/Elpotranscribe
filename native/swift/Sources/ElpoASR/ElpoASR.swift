import Foundation
import AVFoundation
import CryptoKit
import FluidAudio

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
            let engine = request.engine ?? "ultra"
            if engine.hasPrefix("whisper-") {
                if request.action == "install" {
                    try await installWhisper(root: root, engine: engine)
                    emit(["installed": true, "engine": engine]); return
                }
                guard request.action == "transcribe", let source = request.source else { throw Failure(message: "Commande Whisper inconnue") }
                try transcribeWhisper(root: root, engine: engine, source: source, language: request.language); return
            }
            guard engine == "ultra" else { throw Failure(message: "Moteur inconnu") }
            let directory = root.appendingPathComponent(Repo.parakeetUltra.folderName, isDirectory: true)
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
            let actual = try modelHashes(directory)
            guard manifest.sdk == sdkRevision, manifest.files == actual else {
                let changed = Set(manifest.files.keys).union(actual.keys).filter { manifest.files[$0] != actual[$0] }.sorted().prefix(10)
                throw Failure(message: "Intégrité du modèle non vérifiée. Réinstallez-le. Fichiers différents : " + changed.joined(separator: ", "))
            }
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

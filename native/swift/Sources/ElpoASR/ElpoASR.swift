import Foundation
import AVFoundation
import CryptoKit
import FluidAudio

let ultraSDKFolderName = Repo.parakeetUltra.folderName

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
            if request.action == "verify" {
                let lease = try ModelLease(root: root); defer { lease.release() }
                try verifyInstalledModel(root: root, engine: request.engine ?? "ultra")
                emit(["verified": true]); return
            }
            if request.action == "check-updates" {
                let updates = try await checkModelUpdates(root: root)
                emit(["updates": try JSONSerialization.jsonObject(with: JSONEncoder().encode(updates))]); return
            }
            let lease = try ModelLease(root: root)
            defer { lease.release() }
            let engine = request.engine ?? "ultra"
            if engine.hasPrefix("whisper-") {
                try requirePhysicalMemory(engine: engine, bytes: ProcessInfo.processInfo.physicalMemory)
                if request.action == "prompt-info" {
                    try whisperPromptInfo(root: root, engine: engine, prompt: request.whisperPrompt ?? ""); return
                }
                if request.action == "install" {
                    try await installWhisper(root: root, engine: engine)
                    emit(["installed": true, "engine": engine]); return
                }
                guard request.action == "transcribe", let source = request.source else { throw Failure(message: "Commande Whisper inconnue") }
                try transcribeWhisper(root: root, engine: engine, source: source, language: request.language, prompt: request.whisperPrompt); return
            }
            guard engine == "ultra" else { throw Failure(message: "Moteur inconnu") }
            let marker = root.appendingPathComponent("verified.json")
            if request.action == "install" {
                try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
                let sources = try await latestModelSources("ultra")
                let staging = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
                defer { try? FileManager.default.removeItem(at: staging) }
                let directory = staging.appendingPathComponent(ultraSDKFolderName)
                try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
                ModelRegistry.revisionOverrides = [Repo.parakeetUltra.remotePath: sources[0].revision]
                let vocab = ModelNames.ASR.vocabularyFile
                let vocabURL = URL(string: "https://huggingface.co/" + sources[0].repository + "/resolve/" + sources[0].revision + "/" + vocab)!
                let (vocabulary, response) = try await URLSession.shared.data(from: vocabURL)
                guard (response as? HTTPURLResponse)?.statusCode == 200 else { throw Failure(message: "Vocabulaire du modèle indisponible ; version installée conservée") }
                try vocabulary.write(to: directory.appendingPathComponent(vocab))
                // Pinned SDK cache marker: keeps its downloader from purging the
                // pinned vocabulary before downloading the missing model bundles.
                try Data(sources[0].revision.utf8).write(to: directory.appendingPathComponent(".fluidaudio-revision"))
                ModelHub.offlineMode = false
                let progress = InstallProgress(engine: "ultra")
                let observation = Task {
                    while !Task.isCancelled {
                        progress.observePartialFiles(directory: directory, source: sources[0])
                        do { try await Task.sleep(for: .milliseconds(250)) } catch { break }
                    }
                }
                defer { observation.cancel() }
                let models = try await AsrModels.downloadAndLoad(to: directory, version: .ultra)
                progress.validate()
                let manager = AsrManager(); try await manager.loadModels(models); await manager.cleanup()
                let manifest = Manifest(sdk: sdkRevision, files: try modelHashes(directory), sources: sources)
                try activateModel(prepared: directory, root: root, engine: "ultra", manifest: manifest)
                emit(["installed": true, "engine": "Parakeet Ultra"]); return
            }
            guard request.action == "transcribe", let source = request.source else { throw Failure(message: "Commande inconnue") }
            try requirePhysicalMemory(engine: engine, bytes: ProcessInfo.processInfo.physicalMemory)
            let manifest = try JSONDecoder().decode(Manifest.self, from: Data(contentsOf: marker))
            let directory = try installedDirectory(root: root, engine: "ultra", manifest: manifest)
            let actual = try modelHashes(directory)
            guard manifest.sdk == sdkRevision, manifest.files == actual else {
                let changed = Set(manifest.files.keys).union(actual.keys).filter { manifest.files[$0] != actual[$0] }.sorted().prefix(10)
                throw Failure(message: "Intégrité du modèle non vérifiée. Réinstallez-le. Fichiers différents : " + changed.joined(separator: ", "))
            }
            ModelHub.offlineMode = true
            if let source = manifest.sources?.first { ModelRegistry.revisionOverrides = [source.repository: source.revision] }
            let progress = InferenceProgress(engine: engine)
            progress.report(phase: "loading")
            let models = try await AsrModels.load(from: directory, version: .ultra)
            let manager = AsrManager(); try await manager.loadModels(models)
            var decoder = try TdtDecoderState(decoderLayers: AsrModelVersion.ultra.decoderLayers)
            let language: Language?
            if let code = request.language, code != "auto" {
                guard ["fr", "en", "es", "de", "it", "pt"].contains(code), let value = Language(rawValue: code) else { throw Failure(message: "Langue non prise en charge par ce moteur") }
                language = value
            } else { language = nil }
            await manager.setWindowHandler { window in
                progress.windowFinished(index: window.index, total: window.windowCount)
            }
            progress.report(phase: "transcribing")
            // Disk-backed processing bounds memory for long recordings; the SDK preserves chunk offsets.
            let result = try await manager.transcribeDiskBacked(URL(fileURLWithPath: source), decoderState: &decoder, language: language)
            let timings = buildWordTimings(from: result.tokenTimings ?? [])
            guard !result.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, !timings.isEmpty else { throw Failure(message: "Aucune parole horodatée détectée") }
            let words = try timings.map { Word(startMs: try milliseconds($0.startTime), endMs: try milliseconds($0.endTime), text: $0.word) }
            await manager.cleanup()
            let data = try JSONEncoder().encode(words)
            emit(["engine": "Parakeet Ultra", "modelVersion": manifest.sources?.map(\.revision).joined(separator: " / ") ?? sdkRevision, "text": result.text, "durationMs": try milliseconds(result.duration), "processingTimeMs": try milliseconds(result.processingTime), "words": try JSONSerialization.jsonObject(with: data)])
        } catch { emit(["error": error.localizedDescription]); exit(1) }
    }
}

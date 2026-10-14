import Foundation
import MLX
import MLXAudioCore
import MLXAudioSTT
import HuggingFace

let qwenRevision = "244458d7b61e54ff135073ddc9ed76782bb20758"
let languages = ["fr": "French", "en": "English", "es": "Spanish", "de": "German", "it": "Italian", "pt": "Portuguese"]
func qwenRepository(_ engine: String) throws -> String {
    switch engine {
    case "qwen-0.6b": return "mlx-community/Qwen3-ASR-0.6B-4bit"
    case "qwen-1.7b": return "mlx-community/Qwen3-ASR-1.7B-4bit"
    default: throw Failure(message: "Moteur Qwen inconnu")
    }
}
func loadASR(_ directory: URL) async throws { _ = try await Qwen3ASRModel.fromModelDirectory(directory) }
func loadAligner(_ directory: URL) async throws { _ = try await Qwen3ForcedAlignerModel.fromModelDirectory(directory) }
func installQwen(root: URL, engine: String) async throws {
    let repo = try qwenRepository(engine)
    let staging = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    try FileManager.default.createDirectory(at: staging, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: staging) }
    let prepared = staging.appendingPathComponent("prepared")
    try FileManager.default.createDirectory(at: prepared, withIntermediateDirectories: true)
    let cache = HubCache(cacheDirectory: staging.appendingPathComponent("downloads"))
    for (name, id) in [("asr", repo), ("aligner", "mlx-community/Qwen3-ForcedAligner-0.6B-4bit")] {
        let downloaded = try await ModelUtils.resolveOrDownloadModel(repoID: Repo.ID(rawValue: id)!, requiredExtension: "safetensors", cache: cache)
        let destination = prepared.appendingPathComponent(name)
        try FileManager.default.copyItem(at: downloaded, to: destination)
        if name == "asr" { try await loadASR(destination) } else { try await loadAligner(destination) }
        Memory.clearCache()
    }
    let manifest = Manifest(sdk: qwenRevision, files: try modelHashes(prepared))
    let destination = root.appendingPathComponent(engine)
    try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
    if FileManager.default.fileExists(atPath: destination.path) { try FileManager.default.removeItem(at: destination) }
    try FileManager.default.moveItem(at: prepared, to: destination)
    try JSONEncoder().encode(manifest).write(to: root.appendingPathComponent(engine + ".json"), options: .atomic)
}

struct Passage { let offset: Int; let samples: Int; let text: String; let language: String }
func readPassage(_ file: FileHandle, offset: Int, samples: Int) throws -> MLXArray {
    try file.seek(toOffset: UInt64(offset * 4))
    guard let bytes = try file.read(upToCount: samples * 4), bytes.count == samples * 4 else { throw Failure(message: "Audio temporaire incomplet") }
    return bytes.withUnsafeBytes { MLXArray(Array($0.bindMemory(to: Float.self))) }
}
func recognize(directory: URL, audio: URL, count: Int, language: String?) async throws -> [Passage] {
    let model = try await Qwen3ASRModel.fromModelDirectory(directory)
    let file = try FileHandle(forReadingFrom: audio); defer { try? file.close() }
    var passages: [Passage] = []
    // At most 30 seconds of audio/attention tensors at a time on an 8 GB Mac.
    for offset in stride(from: 0, to: count, by: 480000) {
        let samples = min(480000, count - offset)
        let array = try readPassage(file, offset: offset, samples: samples)
        let result = model.generate(audio: array, maxTokens: 2048, language: language)
        guard result.generationTokens < 2048 else { throw Failure(message: "Limite de génération Qwen atteinte ; transcription interrompue") }
        let text = result.text.trimmingCharacters(in: .whitespacesAndNewlines)
        if !text.isEmpty {
            let detected = language ?? result.language ?? ""
            guard languages.values.contains(detected) else { throw Failure(message: "Alignement Qwen indisponible dans cette langue. Utilisez Whisper pour l’arabe.") }
            passages.append(Passage(offset: offset, samples: samples, text: text, language: detected))
        }
        Memory.clearCache()
    }
    return passages
}

// Use the aligner's raw timestamp classes. The SDK's generate() interpolates
// anomalous predictions; that path is deliberately not used here.
func rawAlignment(_ model: Qwen3ForcedAlignerModel, audio: MLXArray, text: String, language: String, offsetMs: UInt64) throws -> [Word] {
    guard let tokenizer = model.tokenizer else { throw Failure(message: "Tokenizer d’alignement absent") }
    let processor = ForceAlignProcessor()
    let (wordList, prompt) = processor.encodeTimestamp(text: text, language: language)
    guard !wordList.isEmpty else { throw Failure(message: "Texte Qwen vide après normalisation") }
    let (features, mask, audioTokens) = model.preprocessAudio(audio)
    let expanded = prompt.replacingOccurrences(of: "<|audio_pad|>", with: String(repeating: "<|audio_pad|>", count: audioTokens))
    let ids = tokenizer.encode(text: expanded)
    let array = MLXArray(ids.map { Int32($0) }).expandedDimensions(axis: 0)
    let logits = model(inputIds: array, inputFeatures: features, featureAttentionMask: mask)
    let predicted = logits.argMax(axis: -1)
    eval(predicted)
    let timestampID = model.config.timestampTokenId ?? 151705
    let step = Double(model.config.timestampSegmentTime ?? 80)
    var times: [UInt64] = []
    for (index, id) in ids.enumerated() where id == timestampID {
        times.append(try milliseconds(Double(predicted[0, index].item(Int32.self)) * step / 1000))
    }
    guard times.count == wordList.count * 2 else { throw Failure(message: "Alignement Qwen incomplet") }
    let original = text.split(whereSeparator: { $0.isWhitespace }).map(String.init).filter { !processor.cleanToken($0).isEmpty }
    let preserve = original.map { processor.cleanToken($0) } == wordList
    return try wordList.enumerated().map { index, word in
        let start = times[index * 2], end = times[index * 2 + 1]
        guard end > start, end <= UInt64(audio.dim(0) / 16 + 160) else { throw Failure(message: "Prédiction d’alignement Qwen invalide ; aucun horodatage interpolé. Essayez Whisper.") }
        return Word(startMs: start + offsetMs, endMs: end + offsetMs, text: preserve ? original[index] : word)
    }
}
func transcribeQwen(root: URL, engine: String, source: String, language: String?) async throws {
    _ = try qwenRepository(engine)
    let directory = root.appendingPathComponent(engine)
    let manifest = try JSONDecoder().decode(Manifest.self, from: Data(contentsOf: root.appendingPathComponent(engine + ".json")))
    guard manifest.sdk == qwenRevision, manifest.files == (try modelHashes(directory)) else { throw Failure(message: "Intégrité Qwen incorrecte. Réinstallez le modèle.") }
    let hint: String?
    if let code = language, code != "auto" {
        guard let name = languages[code] else { throw Failure(message: "Langue non prise en charge pour les SRT Qwen. Utilisez Whisper pour l’arabe.") }
        hint = name
    } else { hint = nil }
    let temporary = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".f32")
    defer { try? FileManager.default.removeItem(at: temporary) }
    let started = Date()
    let count = try floatAudio(URL(fileURLWithPath: source), destination: temporary)
    let passages = try await recognize(directory: directory.appendingPathComponent("asr"), audio: temporary, count: count, language: hint)
    // recognize() has returned: its ASR weights and KV caches are released before
    // loading the aligner, including for the 1.7B model.
    Memory.clearCache()
    let aligner = try await Qwen3ForcedAlignerModel.fromModelDirectory(directory.appendingPathComponent("aligner"))
    let file = try FileHandle(forReadingFrom: temporary); defer { try? file.close() }
    var words: [Word] = []
    for passage in passages {
        let audio = try readPassage(file, offset: passage.offset, samples: passage.samples)
        words += try rawAlignment(aligner, audio: audio, text: passage.text, language: passage.language, offsetMs: UInt64(passage.offset / 16))
        Memory.clearCache()
    }
    guard !words.isEmpty else { throw Failure(message: "Aucune parole horodatée détectée par Qwen") }
    emit(["engine": engine, "modelVersion": qwenRevision, "text": passages.map(\.text).joined(separator: " "), "durationMs": count / 16, "processingTimeMs": try milliseconds(Date().timeIntervalSince(started)), "words": try JSONSerialization.jsonObject(with: JSONEncoder().encode(words))])
}

@main struct ElpoQwen {
    static func main() async {
        let pressure = DispatchSource.makeMemoryPressureSource(eventMask: [.critical], queue: .global())
        pressure.setEventHandler { emit(["error": "Pression mémoire critique. Qwen arrêté pour protéger le Mac."]); exit(2) }
        pressure.resume(); defer { pressure.cancel() }
        do {
            guard ProcessInfo.processInfo.physicalMemory >= 7_500_000_000 else { throw Failure(message: "Qwen nécessite au moins 8 Go de mémoire unifiée") }
            let executable = URL(fileURLWithPath: CommandLine.arguments[0]).resolvingSymlinksInPath()
            let parent = executable.deletingLastPathComponent().deletingLastPathComponent()
            let packaged = parent.appendingPathComponent("Resources/qwen/mlx.metallib")
            let resource = FileManager.default.fileExists(atPath: packaged.path) ? packaged : parent.appendingPathComponent("resources/qwen/mlx.metallib")
            guard FileManager.default.fileExists(atPath: resource.path) else { throw Failure(message: "Bibliothèque Metal Qwen absente du bundle") }
            GPU.metallib = resource
            Memory.cacheLimit = 128 * 1024 * 1024
            Memory.memoryLimit = 4_500_000_000
            let request = try JSONDecoder().decode(Request.self, from: FileHandle.standardInput.readDataToEndOfFile())
            guard let path = request.models, let engine = request.engine else { throw Failure(message: "Commande Qwen incomplète") }
            let root = URL(fileURLWithPath: path)
            if request.action == "install" { try await installQwen(root: root, engine: engine); emit(["installed": true, "engine": engine]); return }
            guard request.action == "transcribe", let source = request.source else { throw Failure(message: "Commande Qwen inconnue") }
            try await transcribeQwen(root: root, engine: engine, source: source, language: request.language)
        } catch { emit(["error": error.localizedDescription]); exit(1) }
    }
}

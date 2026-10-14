import Foundation
import AppKit
import Security

let geminiModel = "gemini-3.5-transcribe"
let geminiService = "com.elpo.elpotranscribe.gemini"
func keyQuery(service: String = geminiService) -> [String: Any] {
    [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: "api-key"]
}
func saveGeminiKey(_ key: String, service: String = geminiService) throws {
    let data = Data(key.utf8)
    guard !data.isEmpty, data.count <= 512 else { throw Failure(message: "Clé API vide ou trop longue") }
    let query = keyQuery(service: service)
    let update = SecItemUpdate(query as CFDictionary, [kSecValueData as String: data] as CFDictionary)
    if update == errSecItemNotFound {
        var item = query; item[kSecValueData as String] = data
        let result = SecItemAdd(item as CFDictionary, nil)
        guard result == errSecSuccess else { throw Failure(message: "Écriture dans le Trousseau refusée (\(result))") }
    } else if update != errSecSuccess { throw Failure(message: "Mise à jour du Trousseau refusée (\(update))") }
}
func readGeminiKey(service: String = geminiService) throws -> String {
    var query = keyQuery(service: service)
    query[kSecReturnData as String] = true
    query[kSecMatchLimit as String] = kSecMatchLimitOne
    var result: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &result)
    guard status == errSecSuccess, let data = result as? Data, let key = String(data: data, encoding: .utf8), !key.isEmpty else {
        throw Failure(message: "Clé Gemini inaccessible dans le Trousseau. Configurez-la dans Paramètres. (\(status))")
    }
    return key
}
func removeGeminiKey(service: String = geminiService) throws {
    let status = SecItemDelete(keyQuery(service: service) as CFDictionary)
    guard status == errSecSuccess || status == errSecItemNotFound else { throw Failure(message: "Suppression de la clé refusée par le Trousseau (\(status))") }
}
@MainActor func promptGeminiKey() throws -> Bool {
    let application = NSApplication.shared
    application.setActivationPolicy(.accessory)
    application.activate(ignoringOtherApps: true)
    let alert = NSAlert()
    alert.messageText = "Clé API Gemini"
    alert.informativeText = "La clé reste dans le Trousseau macOS. Elle n’est pas transmise à l’interface web. L’API Google est facturée séparément de Google AI Pro."
    let input = NSSecureTextField(frame: NSRect(x: 0, y: 0, width: 420, height: 28))
    input.placeholderString = "Clé créée dans Google AI Studio"
    alert.accessoryView = input
    alert.addButton(withTitle: "Enregistrer dans le Trousseau")
    alert.addButton(withTitle: "Annuler")
    alert.window.initialFirstResponder = input
    guard alert.runModal() == .alertFirstButtonReturn else { return false }
    let key = input.stringValue.trimmingCharacters(in: .whitespacesAndNewlines)
    input.stringValue = ""
    try saveGeminiKey(key); return true
}

func geminiHTTPError(_ status: Int) -> Failure {
    let message: String
    switch status {
    case 400: message = "Requête Gemini refusée. Vérifiez le format et la durée audio."
    case 401, 403: message = "Clé Gemini refusée ou accès non autorisé. Vérifiez les restrictions et la facturation Google AI Studio."
    case 404: message = "Gemini 3.5 Transcribe n’est pas accessible avec cette clé ou dans cette région. Aucun autre modèle n’a été substitué."
    case 429: message = "Quota ou limite de débit Gemini atteint. Réessayez plus tard ou vérifiez votre facturation."
    case 500...599: message = "Service Gemini temporairement indisponible."
    default: message = "Erreur Gemini HTTP \(status)."
    }
    return Failure(message: message)
}
func geminiSession() -> URLSession {
    let config = URLSessionConfiguration.ephemeral
    config.timeoutIntervalForRequest = 1800
    config.timeoutIntervalForResource = 1800
    config.httpShouldSetCookies = false
    return URLSession(configuration: config)
}
func testGemini() async throws {
    var request = URLRequest(url: URL(string: "https://generativelanguage.googleapis.com/v1beta/models/" + geminiModel)!)
    request.setValue(try readGeminiKey(), forHTTPHeaderField: "x-goog-api-key")
    let session = geminiSession(); defer { session.invalidateAndCancel() }
    let (_, response) = try await session.data(for: request)
    guard let http = response as? HTTPURLResponse, http.statusCode == 200 else { throw geminiHTTPError((response as? HTTPURLResponse)?.statusCode ?? 0) }
}
func geminiBody(wav: Data, language: String?) -> [String: Any] {
    var config: [String: Any] = ["timestamp_granularities": ["word"], "mode": ["type": "verbatim"]]
    if let code = language, code != "auto" { config["language_codes"] = [code] }
    // Custom vocabulary and smart mode are incompatible with word timestamps.
    return ["model": geminiModel, "store": false, "input": [["type": "audio", "data": wav.base64EncodedString(), "mime_type": "audio/wav"]], "generation_config": ["transcription_config": config]]
}
func geminiOffset(_ value: Any?) throws -> UInt64 {
    guard let text = value as? String, text.range(of: #"^\d+(\.\d+)?s$"#, options: .regularExpression) != nil,
          let seconds = Double(text.dropLast()) else { throw Failure(message: "Horodatage Gemini absent ou invalide") }
    return try milliseconds(seconds)
}
func geminiWords(_ value: [String: Any], durationMs: UInt64) throws -> [Word] {
    guard value["status"] as? String == "completed", let steps = value["steps"] as? [[String: Any]] else { throw Failure(message: "Transcription Gemini incomplète") }
    var words: [Word] = []
    for step in steps {
        for item in step["content"] as? [[String: Any]] ?? [] {
            for annotation in item["annotations"] as? [[String: Any]] ?? [] where annotation["type"] as? String == "word_info" {
                guard let text = annotation["text"] as? String, !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { throw Failure(message: "Mot Gemini vide") }
                let start = try geminiOffset(annotation["start_offset"]), end = try geminiOffset(annotation["end_offset"])
                guard end > start, end <= durationMs + 1000, start >= (words.last?.startMs ?? 0) else { throw Failure(message: "Chronologie Gemini invalide ; aucun temps inventé") }
                words.append(Word(startMs: start, endMs: end, text: text))
            }
        }
    }
    guard !words.isEmpty else { throw Failure(message: "Gemini n’a pas renvoyé d’horodatages de mots. Aucun SRT artificiel créé.") }; return words
}
func pcmWav(_ floats: URL, count: Int) throws -> Data {
    // 30 min of mono 16 kHz PCM16 is 57.6 MB, below the documented 100 MB
    // inline request limit even after base64 encoding. Never truncate a source.
    guard count <= 1800 * 16000 else { throw Failure(message: "Gemini avec horodatages est limité à 30 minutes par fichier dans cette version. Divisez l’audio ou choisissez un moteur local.") }
    var data = Data()
    func u16(_ n: UInt16) { var value = n.littleEndian; withUnsafeBytes(of: &value) { data.append(contentsOf: $0) } }
    func u32(_ n: UInt32) { var value = n.littleEndian; withUnsafeBytes(of: &value) { data.append(contentsOf: $0) } }
    data.append(contentsOf: "RIFF".utf8); u32(UInt32(36 + count * 2)); data.append(contentsOf: "WAVEfmt ".utf8)
    u32(16); u16(1); u16(1); u32(16000); u32(32000); u16(2); u16(16)
    data.append(contentsOf: "data".utf8); u32(UInt32(count * 2))
    let file = try FileHandle(forReadingFrom: floats); defer { try? file.close() }
    while let bytes = try file.read(upToCount: 16384), !bytes.isEmpty {
        try bytes.withUnsafeBytes { buffer in
            for sample in buffer.bindMemory(to: Float.self) {
                guard sample.isFinite else { throw Failure(message: "Échantillon audio invalide") }
                let value = Int16(max(-32768, min(32767, sample * 32767)))
                u16(UInt16(bitPattern: value))
            }
        }
    }
    guard data.count == 44 + count * 2 else { throw Failure(message: "Conversion PCM incomplète") }; return data
}
func transcribeGemini(source: String, language: String?, consent: Bool?) async throws {
    guard consent == true else { throw Failure(message: "Envoi à Google non autorisé") }
    guard try probe(source) <= 1_800_000 else { throw Failure(message: "Gemini avec horodatages : maximum 30 minutes par fichier. Choisissez un moteur local pour cet audio.") }
    let key = try readGeminiKey()
    let temporary = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".f32")
    defer { try? FileManager.default.removeItem(at: temporary) }
    let started = Date()
    let count = try floatAudio(URL(fileURLWithPath: source), destination: temporary)
    let body = geminiBody(wav: try pcmWav(temporary, count: count), language: language)
    var request = URLRequest(url: URL(string: "https://generativelanguage.googleapis.com/v1beta/interactions")!)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue(key, forHTTPHeaderField: "x-goog-api-key")
    request.httpBody = try JSONSerialization.data(withJSONObject: body)
    let session = geminiSession(); defer { session.invalidateAndCancel() }
    let (data, response) = try await session.data(for: request)
    guard let http = response as? HTTPURLResponse, http.statusCode == 200 else { throw geminiHTTPError((response as? HTTPURLResponse)?.statusCode ?? 0) }
    guard let result = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { throw Failure(message: "Réponse Gemini invalide") }
    let duration = UInt64(count / 16)
    let words = try geminiWords(result, durationMs: duration)
    emit(["engine": "gemini", "modelVersion": geminiModel, "text": words.map(\.text).joined(separator: " "), "durationMs": duration, "processingTimeMs": try milliseconds(Date().timeIntervalSince(started)), "words": try JSONSerialization.jsonObject(with: JSONEncoder().encode(words))])
}

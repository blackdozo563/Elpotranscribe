import XCTest
@testable import ElpoASR

final class GeminiTests: XCTestCase {
    // Schema fixture follows google-gemini/cookbook Get_started_transcribe.ipynb.
    // This validates parsing, not an actual API call or recognition quality.
    func testOfficialWordAnnotationsAndMissingTiming() throws {
        let annotation: [String: Any] = ["type": "word_info", "text": "été", "start_offset": "0.125s", "end_offset": "0.875s"]
        func response(_ word: [String: Any]) -> [String: Any] {
            ["status": "completed", "steps": [["content": [["type": "text", "text": "été", "annotations": [word]]]]]]
        }
        let words = try geminiWords(response(annotation), durationMs: 1000)
        XCTAssertEqual(words.count, 1)
        XCTAssertEqual(words[0].startMs, 125)
        XCTAssertEqual(words[0].endMs, 875)
        var missing = annotation; missing.removeValue(forKey: "end_offset")
        XCTAssertThrowsError(try geminiWords(response(missing), durationMs: 1000))
        var reversed = annotation; reversed["end_offset"] = "0.050s"
        XCTAssertThrowsError(try geminiWords(response(reversed), durationMs: 1000))
    }
    func testTimestampRequestExcludesIncompatibleOptions() throws {
        let body = geminiBody(wav: Data([1,2,3]), language: "ar")
        XCTAssertEqual(body["model"] as? String, "gemini-3.5-transcribe")
        XCTAssertEqual(body["store"] as? Bool, false)
        let config = (body["generation_config"] as! [String: Any])["transcription_config"] as! [String: Any]
        XCTAssertEqual(config["timestamp_granularities"] as? [String], ["word"])
        XCTAssertEqual(config["language_codes"] as? [String], ["ar"])
        XCTAssertNil(config["custom_vocabulary"])
        XCTAssertNil(config["diarization_mode"])
        XCTAssertEqual((config["mode"] as? [String: String])?["type"], "verbatim")
    }
    func testCloudConsentRequiredBeforeReadingAudioOrKey() async {
        do {
            try await transcribeGemini(source: "/missing/audio.wav", language: nil, consent: false)
            XCTFail("Unconsented upload was accepted")
        } catch { XCTAssertEqual(error.localizedDescription, "Envoi à Google non autorisé") }
    }
    func testKeychainSaveReplaceReadAndRemove() throws {
        let service = "com.elpo.tests." + UUID().uuidString
        defer { try? removeGeminiKey(service: service) }
        try saveGeminiKey("fixture-only-not-a-real-api-key", service: service)
        XCTAssertEqual(try readGeminiKey(service: service), "fixture-only-not-a-real-api-key")
        try saveGeminiKey("replacement-fixture-only", service: service)
        XCTAssertEqual(try readGeminiKey(service: service), "replacement-fixture-only")
        try removeGeminiKey(service: service)
        XCTAssertThrowsError(try readGeminiKey(service: service))
    }
}

import XCTest
@testable import ElpoASR

final class InferenceProgressTests: XCTestCase {
    func testObservedWindowsAreDeduplicatedAndOrderIndependent() throws {
        let output = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: output) }
        let p = InferenceProgress(engine: "ultra", output: output)
        func json() throws -> [String: Any] { try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: output)) as? [String: Any]) }
        p.report(phase: "loading")
        XCTAssertTrue(try json()["percent"] is NSNull)
        p.windowFinished(index: 2, total: 4)
        XCTAssertEqual(try json()["percent"] as? Int, 25)
        p.windowFinished(index: 2, total: 4)
        p.windowFinished(index: -1, total: 4)
        p.windowFinished(index: 4, total: 4)
        XCTAssertEqual(try json()["percent"] as? Int, 25)
        for i in [0, 3, 1] { p.windowFinished(index: i, total: 4) }
        XCTAssertEqual(try json()["percent"] as? Int, 100)
        XCTAssertEqual(try json()["engine"] as? String, "ultra")
    }
    func testWhisperPercentageIsValidatedAndNeverRewinds() throws {
        let output = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: output) }
        let p = InferenceProgress(engine: "whisper-turbo", output: output)
        p.report(phase: "preparing")
        p.report(phase: "loading")
        p.report(phase: "transcribing", percent: 42)
        for invalid in [-1, 101, 20] { p.report(phase: "transcribing", percent: invalid) }
        p.report(phase: "loading", percent: 99)
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: output)) as? [String: Any])
        XCTAssertEqual(json["percent"] as? Int, 42)
        XCTAssertEqual(json["phase"] as? String, "transcribing")
    }
}

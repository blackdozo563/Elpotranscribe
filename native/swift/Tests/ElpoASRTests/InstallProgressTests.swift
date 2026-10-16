import XCTest
@testable import ElpoASR

final class InstallProgressTests: XCTestCase {
    func testObservedPartialFileAndUnknownTotalThenValidation() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let output = directory.appendingPathComponent("progress.json")
        let progress = InstallProgress(engine: "ultra", output: output)
        try Data(repeating: 1, count: 25).write(to: directory.appendingPathComponent("weights.bin.partial"))
        let source = ModelSource(repository: "fixture", revision: "fixture", files: ["weights.bin": "fixture"], fileSizes: ["weights.bin": 100])
        progress.observePartialFiles(directory: directory, source: source)
        var json = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: output)) as? [String: Any])
        XCTAssertEqual(json["receivedBytes"] as? Int, 25)
        XCTAssertEqual(json["totalBytes"] as? Int, 100)
        progress.report(received: 35, total: nil, file: "weights.bin")
        json = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: output)) as? [String: Any])
        XCTAssertTrue(json["totalBytes"] is NSNull)
        progress.validate()
        progress.report(received: 40, total: 100, file: "weights.bin")
        json = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: output)) as? [String: Any])
        XCTAssertEqual(json["phase"] as? String, "validating")
    }
    func testCatalogueSizesAreOptionalAndDoNotChangeAssetIdentity() throws {
        let asset: [String: Any] = ["rfilename": "ggml-large-v3-turbo-q5_0.bin", "size": 100, "lfs": ["sha256": String(repeating: "1", count: 64)]]
        let source = try parseModelSource(["sha": String(repeating: "2", count: 40), "siblings": [asset]], repository: "fixture", engine: "whisper-turbo")
        XCTAssertEqual(source.fileSizes?["ggml-large-v3-turbo-q5_0.bin"], 100)
        var legacy = source; legacy.fileSizes = nil
        XCTAssertTrue(sameModelAssets([source], [legacy]))
    }
}

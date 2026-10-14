import XCTest
@testable import ElpoASR

final class ModelUpdateTests: XCTestCase {
    func testReadmeRevisionDoesNotTriggerModelUpdate() throws {
        let asset: [String: Any] = ["rfilename": "ggml-base.bin", "lfs": ["sha256": String(repeating: "a", count: 64)]]
        let first = try parseModelSource(["sha": String(repeating: "1", count: 40), "siblings": [asset]], repository: "ggerganov/whisper.cpp", engine: "whisper-base")
        let readme = try parseModelSource(["sha": String(repeating: "2", count: 40), "siblings": [asset, ["rfilename": "README.md", "blobId": String(repeating: "3", count: 40)]]], repository: "ggerganov/whisper.cpp", engine: "whisper-base")
        XCTAssertTrue(sameModelAssets([first], [readme]))
        var changed = asset; changed["lfs"] = ["sha256": String(repeating: "b", count: 64)]
        let next = try parseModelSource(["sha": String(repeating: "4", count: 40), "siblings": [changed]], repository: "ggerganov/whisper.cpp", engine: "whisper-base")
        XCTAssertFalse(sameModelAssets([first], [next]))
    }
    func testActivationFailureKeepsInstalledVersion() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let old = root.appendingPathComponent("whisper-base")
        try FileManager.default.createDirectory(at: old, withIntermediateDirectories: true)
        try Data("previous-verified-weights".utf8).write(to: old.appendingPathComponent("model.bin"))
        let marker = modelMarker(root: root, engine: "whisper-base")
        let before = try JSONEncoder().encode(Manifest(sdk: "fixture", files: try modelHashes(old)))
        try before.write(to: marker)
        XCTAssertThrowsError(try activateModel(prepared: root.appendingPathComponent("missing"), root: root, engine: "whisper-base", manifest: Manifest(sdk: "new", files: [:])))
        XCTAssertEqual(try Data(contentsOf: marker), before)
        XCTAssertEqual(try String(contentsOf: old.appendingPathComponent("model.bin"), encoding: .utf8), "previous-verified-weights")
    }
    func testNewManifestSelectsCompleteNewDirectory() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let staging = root.appendingPathComponent("staging")
        try FileManager.default.createDirectory(at: staging, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root) }
        try Data("initialized-fixture".utf8).write(to: staging.appendingPathComponent("model.bin"))
        try activateModel(prepared: staging, root: root, engine: "whisper-base", manifest: Manifest(sdk: "fixture", files: try modelHashes(staging)))
        let manifest = try JSONDecoder().decode(Manifest.self, from: Data(contentsOf: modelMarker(root: root, engine: "whisper-base")))
        let installed = try installedDirectory(root: root, engine: "whisper-base", manifest: manifest)
        XCTAssertEqual(manifest.files, try modelHashes(installed))
        XCTAssertNotNil(manifest.directory)
    }
    func testLegacyUltraDirectoryKeepsSdkFolderName() throws {
        let root = URL(fileURLWithPath: "/models")
        let manifest = Manifest(sdk: "legacy", files: [:])
        XCTAssertEqual(try installedDirectory(root: root, engine: "ultra", manifest: manifest).lastPathComponent, "parakeet-ultra-coreml")
    }
    func testUnsafeModelDirectoryIsRejected() {
        XCTAssertThrowsError(try installedDirectory(root: URL(fileURLWithPath: "/models"), engine: "ultra", manifest: Manifest(sdk: "fixture", files: [:], directory: "../../audio")))
    }
}

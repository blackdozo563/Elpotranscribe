import XCTest
@testable import ElpoASR
final class TimingTests: XCTestCase {
    func testRealTimestampConversion() throws {
        XCTAssertEqual(try milliseconds(1.234), 1234)
        XCTAssertThrowsError(try milliseconds(-0.1))
        XCTAssertThrowsError(try milliseconds(.nan))
    }
    func testIntegrityChangeDetected() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let file = directory.appendingPathComponent("weights")
        try Data("original".utf8).write(to: file)
        let before = try modelHashes(directory)
        try Data("changed".utf8).write(to: file)
        XCTAssertNotEqual(before, try modelHashes(directory))
    }
}

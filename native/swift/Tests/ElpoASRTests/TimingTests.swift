import XCTest
import AVFoundation
@testable import ElpoASR
final class TimingTests: XCTestCase {
    func testStreamingResamplingStereo44100() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let source = root.appendingPathComponent("stéréo.wav")
        let format = AVAudioFormat(standardFormatWithSampleRate: 44100, channels: 2)!
        let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: 44100)!
        buffer.frameLength = 44100
        for channel in 0..<2 {
            for i in 0..<44100 { buffer.floatChannelData![channel][i] = Float(sin(Double(i) * 2 * .pi * 440 / 44100)) * 0.1 }
        }
        do {
            let file = try AVAudioFile(forWriting: source, settings: format.settings)
            try file.write(from: buffer)
        }
        let destination = root.appendingPathComponent("mono.f32")
        let frames = try floatAudio(source, destination: destination)
        XCTAssertLessThanOrEqual(abs(frames - 16000), 2)
        XCTAssertEqual(try Data(contentsOf: destination).count, frames * 4)
    }
    func testWhisperUTF8TokensUseRecognizedTimes() {
        let collector = WhisperTokens()
        let utf8 = Array(" été".utf8)
        collector.append(Data(utf8.prefix(2)), start: 120, end: 200)
        collector.append(Data(utf8.dropFirst(2)), start: 200, end: 360)
        collector.append(Data(" prochain".utf8), start: 400, end: 700)
        collector.flush()
        XCTAssertFalse(collector.invalid)
        XCTAssertEqual(collector.words.map(\.text), ["été", "prochain"])
        XCTAssertEqual(collector.words[0].startMs, 120)
        XCTAssertEqual(collector.words[0].endMs, 360)
    }
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
    func testIntegrityThroughParentSymlink() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let real = root.appendingPathComponent("real", isDirectory: true)
        let alias = root.appendingPathComponent("linked", isDirectory: true)
        try FileManager.default.createDirectory(at: real, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root) }
        try Data("verified model bytes".utf8).write(to: real.appendingPathComponent("weights.bin"))
        try FileManager.default.createSymbolicLink(at: alias, withDestinationURL: real)
        XCTAssertEqual(try modelHashes(real), try modelHashes(alias))
        XCTAssertEqual(Set(try modelHashes(alias).keys), Set(["weights.bin"]))
    }

}

final class WhisperFallbackTests: XCTestCase {
    func testZeroDurationFrenchWordKeepsEntireRealPassage() throws {
        let output = WhisperOutput()
        output.tokens.append(Data(" ce".utf8), start: 120, end: 120)
        output.tokens.append(Data(" soir".utf8), start: 120, end: 800)
        output.appendSegment(Data(" ce soir".utf8), start: 100, end: 900)
        let result = try output.result()
        XCTAssertEqual(result.granularity, "segment")
        XCTAssertEqual(result.units.map(\.text), ["ce soir"])
        XCTAssertEqual(result.units.first?.startMs, 100)
        XCTAssertEqual(result.units.first?.endMs, 900)
    }
    func testMissingFirstTokenTimeCannotBeHiddenByLaterToken() throws {
        let output = WhisperOutput()
        output.tokens.append(Data(" bo".utf8), start: -1, end: -1)
        output.tokens.append(Data("njour".utf8), start: 200, end: 800)
        output.appendSegment(Data(" bonjour".utf8), start: 100, end: 900)
        XCTAssertEqual(try output.result().granularity, "segment")
    }
    func testCompleteWordsStillUseWordTimes() throws {
        let output = WhisperOutput()
        output.tokens.append(Data(" Bonjour".utf8), start: 120, end: 800)
        output.appendSegment(Data(" Bonjour".utf8), start: 100, end: 900)
        let result = try output.result()
        XCTAssertEqual(result.granularity, "word")
        XCTAssertEqual(result.units.first?.startMs, 120)
    }
    func testNeitherInvalidNorEmptyPassagesAcquireArtificialTimes() {
        let output = WhisperOutput()
        output.tokens.append(Data(" soir".utf8), start: 120, end: 120)
        output.appendSegment(Data(" soir".utf8), start: 0, end: 0)
        XCTAssertThrowsError(try output.result())
        XCTAssertThrowsError(try WhisperOutput().result())
    }
}

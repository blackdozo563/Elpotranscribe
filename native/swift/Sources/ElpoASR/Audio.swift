import Foundation
import AVFoundation

// AVAudioConverter invokes its input block synchronously. Confine the mutable
// decoder state here rather than capturing local variables in a Sendable block.
final class ConversionInput: @unchecked Sendable {
    let file: AVAudioFile
    let buffer: AVAudioPCMBuffer
    var failure: Error?
    init(file: AVAudioFile, buffer: AVAudioPCMBuffer) { self.file = file; self.buffer = buffer }
    func read(_ requested: AVAudioPacketCount, _ state: UnsafeMutablePointer<AVAudioConverterInputStatus>) -> AVAudioBuffer? {
        if file.framePosition >= file.length { state.pointee = .endOfStream; return nil }
        do {
            let remaining = AVAudioFrameCount(min(Int64(buffer.frameCapacity), file.length - file.framePosition))
            try file.read(into: buffer, frameCount: min(requested, remaining))
            state.pointee = buffer.frameLength == 0 ? .endOfStream : .haveData
            return buffer.frameLength == 0 ? nil : buffer
        } catch { failure = error; state.pointee = .endOfStream; return nil }
    }
}
// Decode and resample in bounded buffers; never retain an entire recording in a
// Swift array. whisper.cpp reads the resulting disk-backed Float32 mapping.
func floatAudio(_ source: URL, destination: URL) throws -> Int {
    let input = try AVAudioFile(forReading: source)
    guard let format = AVAudioFormat(commonFormat: .pcmFormatFloat32, sampleRate: 16000, channels: 1, interleaved: false),
          let converter = AVAudioConverter(from: input.processingFormat, to: format),
          let inBuffer = AVAudioPCMBuffer(pcmFormat: input.processingFormat, frameCapacity: 4096),
          let outBuffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: 4096) else {
        throw Failure(message: "Conversion audio 16 kHz indisponible")
    }
    guard FileManager.default.createFile(atPath: destination.path, contents: nil) else { throw Failure(message: "Fichier temporaire inaccessible") }
    let file = try FileHandle(forWritingTo: destination); defer { try? file.close() }
    let provider = ConversionInput(file: input, buffer: inBuffer)
    var count = 0
    while true {
        var conversionError: NSError?
        let status = converter.convert(to: outBuffer, error: &conversionError) { requested, state in
            provider.read(requested, state)
        }
        if let error = provider.failure { throw error }
        if let error = conversionError { throw error }
        if outBuffer.frameLength > 0, let channel = outBuffer.floatChannelData?[0] {
            count += Int(outBuffer.frameLength)
            guard count <= Int(Int32.max) else { throw Failure(message: "Audio trop long pour Whisper") }
            try file.write(contentsOf: Data(bytes: channel, count: Int(outBuffer.frameLength) * MemoryLayout<Float>.size))
        }
        if status == .endOfStream { break }
        if status == .error { throw Failure(message: "Échec de conversion audio") }
    }
    guard count > 0 else { throw Failure(message: "Audio vide") }; return count
}


import Foundation

/// Ephemeral, observed engine progress. Never affects transcript boundaries.
final class InferenceProgress: @unchecked Sendable {
    let engine: String
    private let output: URL?
    private let lock = NSLock()
    private var windows = Set<Int>()
    private var lastPercent: Int?
    init(engine: String, output: URL? = nil) {
        self.engine = engine
        self.output = output ?? ProcessInfo.processInfo.environment["ELPO_INFERENCE_PROGRESS"].map { URL(fileURLWithPath: $0) }
    }
    func report(phase: String, percent: Int? = nil) {
        lock.lock(); defer { lock.unlock() }
        write(phase: phase, percent: percent)
    }
    private func write(phase: String, percent: Int?) {
        guard ["loading", "preparing", "transcribing"].contains(phase),
              percent == nil || (phase == "transcribing" && (0...100).contains(percent!)),
              let output else { return }
        if let percent {
            guard lastPercent == nil || percent >= lastPercent! else { return }
            lastPercent = percent
        }
        let value: [String: Any] = ["engine": engine, "phase": phase, "percent": percent.map { $0 as Any } ?? NSNull()]
        if let data = try? JSONSerialization.data(withJSONObject: value) { try? data.write(to: output, options: .atomic) }
    }
    func windowFinished(index: Int, total: Int) {
        lock.lock(); defer { lock.unlock() }
        guard total > 0, index >= 0, index < total else { return }
        windows.insert(index)
        write(phase: "transcribing", percent: Int(100.0 * Double(windows.count) / Double(total)))
    }
}

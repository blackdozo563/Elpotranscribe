import Foundation

/// Reports real bytes for the current file, never the SDK's weighted phase fraction.
final class InstallProgress: NSObject, URLSessionDownloadDelegate, @unchecked Sendable {
    let engine: String
    private let output: URL?
    private let lock = NSLock()
    private var validating = false
    init(engine: String, output: URL? = nil) {
        self.engine = engine
        self.output = output ?? ProcessInfo.processInfo.environment["ELPO_INSTALL_PROGRESS"].map { URL(fileURLWithPath: $0) }
    }
    func report(received: UInt64, total: UInt64?, file: String, validating: Bool = false) {
        lock.lock(); defer { lock.unlock() }
        guard !self.validating || validating else { return }
        self.validating = validating
        guard let output else { return }
        let validTotal = total.flatMap { $0 > 0 && received <= $0 ? $0 : nil }
        let value: [String: Any] = ["engine": engine, "receivedBytes": received, "totalBytes": validTotal.map { $0 as Any } ?? NSNull(), "fileName": file, "phase": validating ? "validating" : "downloading"]
        if let data = try? JSONSerialization.data(withJSONObject: value) { try? data.write(to: output, options: .atomic) }
    }
    func validate() { report(received: 0, total: nil, file: "Validation", validating: true) }
    func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didFinishDownloadingTo location: URL) {}
    func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didWriteData bytesWritten: Int64, totalBytesWritten: Int64, totalBytesExpectedToWrite: Int64) {
        guard totalBytesWritten >= 0 else { return }
        report(received: UInt64(totalBytesWritten), total: totalBytesExpectedToWrite > 0 ? UInt64(totalBytesExpectedToWrite) : nil, file: downloadTask.originalRequest?.url?.lastPathComponent ?? "Modèle")
    }
    /// FluidAudio exposes a phase fraction, not byte counters. Its downloader writes
    /// <destination>.partial. Only those actual file sizes are observed here.
    func observePartialFiles(directory: URL, source: ModelSource) {
        for name in source.files.keys.sorted() {
            guard !name.hasPrefix("/"), !name.split(separator: "/").contains("..") else { continue }
            let path = directory.appendingPathComponent(name + ".partial")
            guard let values = try? FileManager.default.attributesOfItem(atPath: path.path), values[.type] as? FileAttributeType == .typeRegular,
                  let size = values[.size] as? NSNumber else { continue }
            report(received: size.uint64Value, total: source.fileSizes?[name], file: name)
            return
        }
    }
}

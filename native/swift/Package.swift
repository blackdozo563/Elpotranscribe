// swift-tools-version: 6.2
import PackageDescription
import Foundation
let repository = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().path
let package = Package(
    name: "ElpoASR", platforms: [.macOS(.v14)],
    products: [.executable(name: "elpo-asr", targets: ["ElpoASR"])],
    dependencies: [.package(url: "https://github.com/FluidInference/FluidAudio.git", revision: "224de0fb3c304b41bbae24e85e1801900865ff3e", traits: [])],
    targets: [.target(name: "CWhisper", cSettings: [.unsafeFlags(["-I" + repository + "/target/whisper/source/include", "-I" + repository + "/target/whisper/source/ggml/include"])]),
              .executableTarget(name: "ElpoASR", dependencies: ["CWhisper", .product(name: "FluidAudio", package: "FluidAudio")], linkerSettings: [
                .unsafeFlags(["-L" + repository + "/target/whisper/lib", "-lwhisper", "-lggml", "-lggml-cpu", "-lggml-blas", "-lggml-metal", "-lggml-base", "-lc++"]),
                .linkedFramework("Accelerate"), .linkedFramework("Metal"), .linkedFramework("MetalKit")]),
              .testTarget(name: "ElpoASRTests", dependencies: ["ElpoASR"])]
)

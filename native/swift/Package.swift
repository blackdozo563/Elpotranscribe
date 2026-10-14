// swift-tools-version: 6.2
import PackageDescription
let package = Package(
    name: "ElpoASR", platforms: [.macOS(.v14)],
    products: [.executable(name: "elpo-asr", targets: ["ElpoASR"])],
    dependencies: [.package(url: "https://github.com/FluidInference/FluidAudio.git", revision: "224de0fb3c304b41bbae24e85e1801900865ff3e", traits: [])],
    targets: [.executableTarget(name: "ElpoASR", dependencies: [.product(name: "FluidAudio", package: "FluidAudio")]),
              .testTarget(name: "ElpoASRTests", dependencies: ["ElpoASR"])]
)

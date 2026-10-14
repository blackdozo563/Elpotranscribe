// swift-tools-version: 6.3
import PackageDescription
let package = Package(
    name: "ElpoQwen", platforms: [.macOS(.v14)],
    products: [.executable(name: "elpo-qwen", targets: ["ElpoQwen"])],
    dependencies: [
        .package(url: "https://github.com/Blaizzy/mlx-audio-swift.git", revision: "244458d7b61e54ff135073ddc9ed76782bb20758"),
        .package(url: "https://github.com/ml-explore/mlx-swift.git", exact: "0.32.3"),
        .package(url: "https://github.com/ml-explore/mlx-swift-lm.git", exact: "3.32.3"),
        .package(url: "https://github.com/huggingface/swift-huggingface.git", exact: "0.12.0")
    ],
    targets: [.executableTarget(name: "ElpoQwen", dependencies: [
        .product(name: "MLX", package: "mlx-swift"),
        .product(name: "MLXAudioCore", package: "mlx-audio-swift"),
        .product(name: "MLXAudioSTT", package: "mlx-audio-swift"),
        .product(name: "HuggingFace", package: "swift-huggingface")
    ])]
)

mod benchmark;
#[cfg(target_os = "macos")]
mod desktop;
#[cfg(any(target_os = "macos", test))]
mod download_progress;
#[cfg(any(target_os = "macos", test))]
mod history;
#[cfg(any(target_os = "macos", test))]
mod inference_progress;
#[cfg(target_os = "macos")]
mod menus;
#[cfg(any(target_os = "macos", test))]
mod model_disk;
#[cfg(any(target_os = "macos", test))]
mod preferences;
fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args.first().is_some_and(|arg| arg == "--bench-local") {
        if let Err(error) = benchmark::run(&args[1..]) {
            eprintln!("{error}");
            std::process::exit(1);
        }
        return;
    }
    #[cfg(target_os = "macos")]
    desktop::run();
    #[cfg(not(target_os = "macos"))]
    {
        eprintln!("ELPOTRANSCRIBE nécessite macOS 14+ Apple Silicon.");
        std::process::exit(1);
    }
}

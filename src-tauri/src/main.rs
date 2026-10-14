#[cfg(target_os = "macos")]
mod desktop;
fn main() {
    #[cfg(target_os = "macos")]
    desktop::run();
    #[cfg(not(target_os = "macos"))]
    {
        eprintln!("ELPOTRANSCRIBE nécessite macOS 14+ Apple Silicon.");
        std::process::exit(1);
    }
}

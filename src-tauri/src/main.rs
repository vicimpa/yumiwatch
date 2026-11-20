#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    #[cfg(target_os = "macos")]
    if std::env::args_os().nth(1).as_deref() == Some(std::ffi::OsStr::new("--check-libmpv")) {
        if !yummywatch_lib::check_bundled_library() {
            eprintln!("Unable to load the bundled libmpv and media protocol.");
            std::process::exit(1);
        }
        return;
    }
    yummywatch_lib::run();
}

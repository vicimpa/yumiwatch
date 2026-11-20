use std::{env, path::PathBuf, process::Command};

fn main() {
    if env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        // Cargo checks and tests can run independently of Tauri's libmpv preparation hook.
        // Tauri's app bundler still requires and signs the dylib declared in its config.
        if !std::path::Path::new("native-libs/macos/libmpv.2.dylib").is_file() {
            let mut config = env::var("TAURI_CONFIG")
                .ok()
                .map(|json| serde_json::from_str(&json).expect("invalid TAURI_CONFIG"))
                .unwrap_or_else(|| serde_json::json!({}));
            config["bundle"]["macOS"]["frameworks"] = serde_json::json!([]);
            env::set_var("TAURI_CONFIG", config.to_string());
        }
        let out = PathBuf::from(env::var_os("OUT_DIR").unwrap());
        let file = "src/native_video/player.m";
        let target = env::var("TARGET").unwrap().replace("aarch64", "arm64");
        let object = out.join("native_video.o");
        let archive = out.join("libnative_video.a");
        assert!(
            Command::new("xcrun")
                .args([
                    "--sdk",
                    "macosx",
                    "clang",
                    "-fobjc-arc",
                    "-Wno-deprecated-declarations",
                    "-mmacosx-version-min=12.0",
                    "-target",
                    &target,
                    "-c",
                    file,
                    "-o"
                ])
                .arg(&object)
                .status()
                .expect("could not start macOS clang")
                .success(),
            "could not compile the native video surface"
        );
        assert!(
            Command::new("xcrun")
                .args(["ar", "crs"])
                .arg(&archive)
                .arg(&object)
                .status()
                .expect("could not start macOS ar")
                .success(),
            "could not archive the native video surface"
        );
        println!("cargo:rerun-if-changed={file}");
        println!("cargo:rerun-if-changed=../packaging/macos/yumiwatch_protocol.h");
        println!("cargo:rustc-link-search=native={}", out.display());
        println!("cargo:rustc-link-lib=static=native_video");
        for framework in ["AppKit", "OpenGL", "QuartzCore", "ImageIO", "CoreGraphics"] {
            println!("cargo:rustc-link-lib=framework={framework}");
        }
    }
    tauri_build::build()
}

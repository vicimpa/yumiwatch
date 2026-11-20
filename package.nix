{
  lib,
  rustPlatform,
  buildNpmPackage,
  importNpmLock,
  pkg-config,
  wrapGAppsHook3,
  copyDesktopItems,
  makeDesktopItem,
  glib,
  gtk3,
  libsoup_3,
  webkitgtk_4_1,
  gst_all_1,
}:

let
  pname = "yummywatch";
  version = (builtins.fromJSON (builtins.readFile ./package.json)).version;
  src = lib.cleanSource ./.;

  frontend = buildNpmPackage {
    pname = "${pname}-frontend";
    inherit version src;

    npmDeps = importNpmLock { npmRoot = src; };
    npmConfigHook = importNpmLock.npmConfigHook;
    npmBuildScript = "build:web";

    installPhase = ''
      runHook preInstall
      mkdir -p $out
      cp -r dist/. $out/
      runHook postInstall
    '';
  };

  gstPlugins = with gst_all_1; [
    gstreamer
    gst-plugins-base
    gst-plugins-good
    gst-plugins-bad
    gst-libav
  ];
in
rustPlatform.buildRustPackage {
  inherit pname version src;

  cargoLock.lockFile = ./src-tauri/Cargo.lock;
  buildAndTestSubdir = "src-tauri";

  nativeBuildInputs = [
    pkg-config
    wrapGAppsHook3
    copyDesktopItems
  ];

  buildInputs = [
    glib
    gtk3
    libsoup_3
    webkitgtk_4_1
  ] ++ gstPlugins;

  preBuild = ''
    mkdir -p dist
    cp -r ${frontend}/. dist/
  '';

  preFixup = ''
    gappsWrapperArgs+=(
      --prefix GST_PLUGIN_SYSTEM_PATH_1_0 : "${lib.makeSearchPath "lib/gstreamer-1.0" gstPlugins}"
      --set GST_PLUGIN_SCANNER "${gst_all_1.gstreamer}/libexec/gstreamer-1.0/gst-plugin-scanner"
    )
  '';

  postInstall = ''
    install -Dm644 src-tauri/icons/icon.png \
      $out/share/icons/hicolor/512x512/apps/yummywatch.png
    install -Dm644 public/OFL.txt \
      $out/share/licenses/yummywatch/OpenSans-OFL.txt
    install -Dm644 public/licenses/shaka-player.txt \
      $out/share/licenses/yummywatch/Shaka-Apache-2.0.txt
  '';

  desktopItems = [
    (makeDesktopItem {
      name = "yummywatch";
      exec = "yummywatch";
      icon = "yummywatch";
      desktopName = "YummyWatch";
      comment = "Аниме под рукой";
      categories = [
        "AudioVideo"
        "Video"
        "Player"
      ];
    })
  ];

  meta = {
    description = "Anime player and YummyAnime catalog client";
    homepage = "https://github.com/vicimpa/yummywatch";
    platforms = lib.platforms.linux;
    mainProgram = "yummywatch";
  };
}

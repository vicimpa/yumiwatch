#!/usr/bin/env bash
set -euo pipefail

target=${1:?Pass aarch64-apple-darwin or x86_64-apple-darwin}
output=${2:?Pass the output directory}
recipe_dir=$(cd "$(dirname "$0")" && pwd)
case "$target" in
  aarch64-apple-darwin) arch=arm64; ffarch=aarch64; cpu=aarch64 ;;
  x86_64-apple-darwin) arch=x86_64; ffarch=x86_64; cpu=x86_64 ;;
  *) echo "Unsupported libmpv target: $target" >&2; exit 2 ;;
esac

mkdir -p "$output"
output=$(cd "$output" && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
prefix="$work/prefix"
sdk=$(xcrun --sdk macosx --show-sdk-path)
jobs=${YUMIWATCH_MPV_JOBS:-$(sysctl -n hw.logicalcpu 2>/dev/null || echo 6)}
mkdir -p "$prefix/lib/pkgconfig"

source_archive() {
  local name=$1 url=$2 digest=$3
  local archive="$work/$name"
  if [[ -n ${YUMIWATCH_MPV_ARCHIVES:-} && -f "$YUMIWATCH_MPV_ARCHIVES/$name" ]]; then
    cp "$YUMIWATCH_MPV_ARCHIVES/$name" "$archive"
  else
    curl --fail --location --retry 3 --silent --show-error "$url" -o "$archive"
  fi
  echo "$digest  $archive" | shasum -a 256 --check
  mkdir "$work/${name%%.tar.*}"
  tar xf "$archive" --strip-components 1 -C "$work/${name%%.tar.*}"
}

source_archive mpv-0.42.0.tar.gz https://codeload.github.com/mpv-player/mpv/tar.gz/refs/tags/v0.42.0 bcfebbfa2b65a6d88dc97ea18117831072373e38b5785a2afb874ed4df5070dd
source_archive ffmpeg-8.1.tar.xz https://ffmpeg.org/releases/ffmpeg-8.1.tar.xz b072aed6871998cce9b36e7774033105ca29e33632be5b6347f3206898e0756a
source_archive libplacebo-7.387.0.tar.gz https://codeload.github.com/haasn/libplacebo/tar.gz/refs/tags/v7.387.0 f9e62d3774a9c4cfd198ec3abaa88294aaade2e31c04d5ab02bcf4abc98b1df5
source_archive libass-0.17.4.tar.gz https://codeload.github.com/libass/libass/tar.gz/refs/tags/0.17.4 c287d180d93dc9c9021872574b618ac49027e84cc90e1289318b1ee68bb42251
source_archive freetype-2.14.1.tar.gz https://codeload.github.com/freetype/freetype/tar.gz/refs/tags/VER-2-14-1 44bd69d1f0750603410cfd4f26f1c5523c5a3a087a2dfa8639b757dc7c6677be
source_archive fribidi-1.0.16.tar.gz https://codeload.github.com/fribidi/fribidi/tar.gz/refs/tags/v1.0.16 5a1d187a33daa58fcee2ad77f0eb9d136dd6fa4096239199ba31e850d397e8a8
source_archive harfbuzz-12.1.0.tar.gz https://codeload.github.com/harfbuzz/harfbuzz/tar.gz/refs/tags/12.1.0 0238bf7ada6b1fb92984f69f8b9cd66518af83cf24f7db1cfe60c772c42312d3

source_archive fast_float-8.1.0.tar.gz https://codeload.github.com/fastfloat/fast_float/tar.gz/refs/tags/v8.1.0 4bfabb5979716995090ce68dce83f88f99629bc17ae280eae79311c5340143e1
source_archive vulkan-headers-1.4.321.tar.gz https://codeload.github.com/KhronosGroup/Vulkan-Headers/tar.gz/refs/tags/v1.4.321 7c1874f9186d9e7d5245e279cdccaa77a66ed8f52871b428630aeb771dc7623c
cp -R "$work/vulkan-headers-1.4.321"/. "$work/libplacebo-7.387.0/3rdparty/Vulkan-Headers/"
cp -R "$work/fast_float-8.1.0"/. "$work/libplacebo-7.387.0/3rdparty/fast_float/"

export MACOSX_DEPLOYMENT_TARGET=12.0
export PKG_CONFIG_LIBDIR="$prefix/lib/pkgconfig"
unset PKG_CONFIG_PATH
flags="-arch $arch -isysroot $sdk -mmacosx-version-min=$MACOSX_DEPLOYMENT_TARGET"
meson_machine=()
ffmpeg_cross=()
if [[ $(uname -m) != "$arch" ]]; then
  cat > "$work/cross.ini" <<CONFIG
[constants]
architecture_flags = ['-arch', '$arch', '-isysroot', '$sdk', '-mmacosx-version-min=12.0']
[binaries]
c = 'clang'
cpp = 'clang++'
objc = 'clang'
ar = 'ar'
strip = 'strip'
pkg-config = 'pkg-config'
[built-in options]
c_args = architecture_flags
cpp_args = architecture_flags
objc_args = architecture_flags
c_link_args = architecture_flags
cpp_link_args = architecture_flags
objc_link_args = architecture_flags
[host_machine]
system = 'darwin'
cpu_family = '$cpu'
cpu = '$cpu'
endian = 'little'
[properties]
needs_exe_wrapper = true
CONFIG
  meson_machine=(--cross-file "$work/cross.ini")
  ffmpeg_cross=(--enable-cross-compile)
fi

build() {
  local project=$1 library=$2
  shift 2
  meson setup "$work/$project/build" "$work/$project" ${meson_machine[@]+"${meson_machine[@]}"} \
    --wrap-mode=nodownload --prefix="$prefix" --libdir=lib \
    --buildtype=minsize --strip --default-library="$library" \
    -Dauto_features=disabled -Dprefer_static=true "$@"
  meson compile -C "$work/$project/build" -j "$jobs"
  meson install -C "$work/$project/build" --no-rebuild
}

build freetype-2.14.1 static -Dharfbuzz=disabled -Dzlib=disabled
build fribidi-1.0.16 static -Ddocs=false -Dbin=false -Dtests=false
build harfbuzz-12.1.0 static -Dfreetype=enabled -Dtests=disabled -Dutilities=disabled
build libass-0.17.4 static -Dcoretext=enabled
build libplacebo-7.387.0 static -Ddemos=false

# FFmpeg needs libxml2 for MPEG-DASH. Use the macOS SDK copy.
cat > "$prefix/lib/pkgconfig/libxml-2.0.pc" <<CONFIG
Name: libxml2
Description: macOS system XML library
Version: 2.9.13
Libs: -lxml2
Cflags: -I$sdk/usr/include/libxml2
CONFIG
cp "$recipe_dir"/yumiwatch_protocol.{c,h} "$work/ffmpeg-8.1/libavformat/"
python3 - "$work/ffmpeg-8.1/libavformat" <<'PYTHON'
from pathlib import Path
import sys

root = Path(sys.argv[1])

def replace(name, old, new):
    path = root / name
    text = path.read_text()
    if text.count(old) != 1:
        raise RuntimeError(f"Patch for {name} no longer applies")
    path.write_text(text.replace(old, new))

replace("protocols.c", "extern const URLProtocol ff_http_protocol;",
        "extern const URLProtocol ff_http_protocol;\nextern const URLProtocol ff_yumiwatch_protocol;")
replace("Makefile", "OBJS-$(CONFIG_HTTP_PROTOCOL)",
        "OBJS-$(CONFIG_YUMIWATCH_PROTOCOL)         += yumiwatch_protocol.o\nOBJS-$(CONFIG_HTTP_PROTOCOL)")
replace("hls.c", 'else if (av_strstart(proto_name, "data", NULL)) {',
        'else if (!strcmp(proto_name, "yumiwatch") || av_strstart(proto_name, "data", NULL)) {')
PYTHON
(
  cd "$work/ffmpeg-8.1"
  ./configure --prefix="$prefix" --target-os=darwin --arch="$ffarch" \
    ${ffmpeg_cross[@]+"${ffmpeg_cross[@]}"} \
    --cc=clang --extra-cflags="$flags" --extra-ldflags="$flags" \
    --disable-autodetect --disable-everything --disable-programs --disable-doc \
    --disable-debug --disable-avdevice --disable-x86asm \
    --enable-static --enable-pic --enable-small --enable-network \
    --enable-securetransport --enable-videotoolbox --enable-audiotoolbox --enable-libxml2 \
    --enable-demuxer=mov,hls,dash,mpegts,aac,ac3,eac3,mp3,webvtt \
    --enable-protocol=http,https,tls,tcp,crypto,yumiwatch \
    --enable-decoder=h264,hevc,aac_at,mp3_at,ac3_at,eac3_at,webvtt \
    --enable-parser=h264,hevc,aac,ac3,mpegaudio \
    --enable-hwaccel=h264_videotoolbox,hevc_videotoolbox \
    --enable-filter=buffer,buffersink,abuffer,abuffersink,format,aformat,aresample,scale \
    --enable-muxer=spdif
  make -j "$jobs"
  make install
)

# Build Cocoa's renderer integration without mpv's Swift application glue.
# mpv 0.42 guards some Swift-only hooks with HAVE_COCOA. The renderer also
# needs explicit IOSurface linkage when FFmpeg and libplacebo are static.
python3 - "$work/mpv-0.42.0" <<'PYTHON'
from pathlib import Path
import sys

root = Path(sys.argv[1])
meson = root / 'meson.build'
meson.write_text(meson.read_text().replace(
    "'osdep/mac/app_bridge.m',\n                     'player/clipboard/clipboard-mac.m'",
    "'osdep/mac/app_bridge.m'",
).replace(
    '# build targets',
    "dependencies += dependency('appleframeworks', modules: ['IOSurface'])\n"
    "dependencies += declare_dependency(link_args: ['-lc++'])\n\n# build targets",
))
for name in ['player/clipboard/clipboard.c', 'player/main.c', 'input/input.c']:
    path = root / name
    path.write_text(path.read_text().replace('#if HAVE_COCOA', '#if HAVE_SWIFT'))
stream = root / 'stream/stream_lavf.c'
text = stream.read_text()
entry = '    PROTO("srtp"),'
if text.count(entry) != 1:
    raise RuntimeError("Patch for stream_lavf.c no longer applies")
stream.write_text(text.replace(entry, entry + '\n    PROTO("yumiwatch"),'))
PYTHON

build mpv-0.42.0 shared -Dgpl=false -Dcplayer=false -Dlibmpv=true -Dbuild-date=false \
  -Dcocoa=enabled -Dgl=enabled -Dgl-cocoa=enabled -Dvideotoolbox-gl=enabled -Dcoreaudio=enabled \
  -Dlua=disabled -Dswift-build=disabled -Db_lundef=true

cp -L "$prefix/lib/libmpv.2.dylib" "$output/libmpv.2.dylib"
install_name_tool -id '@rpath/libmpv.2.dylib' "$output/libmpv.2.dylib"
otool -L "$output/libmpv.2.dylib"
if otool -L "$output/libmpv.2.dylib" | tail -n +2 | awk '{print $1}' |
  grep -Ev '^(@rpath/libmpv\.2\.dylib|/usr/lib/|/System/Library/Frameworks/)'; then
  echo 'Unexpected non-system dependency in libmpv.' >&2
  exit 1
fi

licenses="$output/libmpv-licenses"
mkdir -p "$licenses"
cp "$work/mpv-0.42.0/LICENSE.LGPL" "$licenses/mpv.txt"
cp "$work/mpv-0.42.0/Copyright" "$licenses/mpv-copyright.txt"
cp "$work/ffmpeg-8.1/COPYING.LGPLv2.1" "$licenses/ffmpeg.txt"
cp "$work/libplacebo-7.387.0/LICENSE" "$licenses/libplacebo.txt"
cp "$work/libass-0.17.4/COPYING" "$licenses/libass.txt"
cp "$work/freetype-2.14.1/docs/FTL.TXT" "$licenses/freetype.txt"
cp "$work/fribidi-1.0.16/COPYING" "$licenses/fribidi.txt"
cp "$work/harfbuzz-12.1.0/COPYING" "$licenses/harfbuzz.txt"
cp "$work/fast_float-8.1.0/LICENSE-MIT" "$licenses/fast_float.txt"
cp "$work/vulkan-headers-1.4.321/LICENSE.md" "$licenses/vulkan-headers.txt"
cp "$0" "$licenses/build-libmpv.sh"
cp "$recipe_dir"/yumiwatch_protocol.{c,h} "$licenses/"

#!/usr/bin/env bash
set -euo pipefail

pacman -Syu --noconfirm --needed \
  gtk3 webkit2gtk-4.1 libsoup3 desktop-file-utils hicolor-icon-theme \
  gst-plugins-good gst-plugins-bad gst-libav
useradd --create-home builder
install -d -o builder -g builder /tmp/build
cp /input/* /tmp/build/
chown -R builder:builder /tmp/build
runuser -u builder -- bash -c 'cd /tmp/build; makepkg --noconfirm --cleanbuild --force'

packages=(/tmp/build/yummywatch-*.pkg.tar.zst)
test "${#packages[@]}" -eq 1
test -f "${packages[0]}"
pacman -U --noconfirm "${packages[0]}"
pacman -Q yummywatch
pacman -Qkk yummywatch
ldd /usr/bin/yummywatch | tee /tmp/linked-libraries.txt
if grep -q 'not found' /tmp/linked-libraries.txt; then
  exit 1
fi
desktop-file-validate /usr/share/applications/YummyWatch.desktop
cp "${packages[0]}" /output/

# libmpv upscaling shaders

- [AMD FidelityFX Super Resolution v1.0.2, ported by agyild](https://gist.githubusercontent.com/agyild/82219c545228d70c5604f865ce0b0ce5/raw/f1794d720013ccd9c5c86a0f20fddd71e0375f94/FSR.glsl) (MIT).
- [Anime4K CNN x2 S from Anime4K v4.0.1](https://github.com/bloc97/Anime4K/blob/v4.0.1/glsl/Upscale/Anime4K_Upscale_CNN_x2_S.glsl) (MIT).
- [FSRCNNX x2 8-0-4-1 from igv's 1.1 release](https://github.com/igv/FSRCNN-TensorFlow/releases/tag/1.1) ([LGPL-3.0-or-later](LGPL-3.0.txt), with the [GPL-3.0 text](GPL-3.0.txt) it incorporates).

The macOS bundle ships the shaders as standalone GLSL source files in `Contents/Resources/upscaling`. To use a modified FSRCNNX shader, replace its GLSL file in that directory and restart playback. macOS may require re-signing a modified app bundle.

# Third-party notices

Vora Desktop is licensed under the GNU Affero General Public License v3.0 (see `LICENSE`).
It ships with, or uses, the following software.

## mpv (Windows installer only)

The Windows installer bundles mpv **0.41.0**, the official release build
`mpv-v0.41.0-x86_64-w64-mingw32.zip` from <https://github.com/mpv-player/mpv/releases/tag/v0.41.0>,
unchanged. The pin, with its SHA-256, is `scripts/mpv-windows.json`.

- Licence: GNU General Public License v2 or later; parts LGPL v2.1 or later. The texts are
  installed beside it as `mpv/LICENSE.GPL`, `mpv/LICENSE.LGPL` and `mpv/Copyright`.
- Source: <https://github.com/mpv-player/mpv/tree/v0.41.0>. The build is made by mpv's own CI
  from that tag: the `mingw` job of `.github/workflows/build.yml` runs `ci/build-mingw64.sh`,
  which fetches and builds the libraries below.
- The build includes the DLLs mpv needs, among them FFmpeg (`avcodec`, `avformat`, `avfilter`,
  `avutil`, `avdevice`, `swresample`, `swscale`; LGPL v2.1+ / GPL v2+, <https://ffmpeg.org>),
  libplacebo (LGPL v2.1+), libass (ISC), FreeType (FreeType Licence / GPL v2), HarfBuzz (MIT),
  FriBidi (LGPL v2.1+), dav1d (BSD 2-clause), Little CMS (MIT), shaderc and SPIRV-Cross
  (Apache 2.0), the Vulkan loader (Apache 2.0), zlib (zlib licence), libiconv (LGPL v2.1+),
  and the MinGW-w64 GCC runtime (GPL v3 with the GCC Runtime Library Exception).

On Linux, Vora Desktop uses the mpv installed by your distribution.

## Inter

The player controls use the Inter typeface, version 4.1, by The Inter Project Authors
(<https://github.com/rsms/inter>), under the SIL Open Font License 1.1. The licence is
installed beside the fonts as `player/fonts/Inter-LICENSE.txt`.

## Electron and Chromium

Vora Desktop is built on Electron (MIT, <https://github.com/electron/electron>), which
includes Chromium and Node.js. Their licences are installed with the app as `LICENSE` and
`LICENSES.chromium.html`.

## npm packages

The app updates itself with electron-updater (MIT, <https://github.com/electron-userland/electron-builder>),
which brings builder-util-runtime, debug, fs-extra, js-yaml, jsonfile, lazy-val,
lodash.escaperegexp, lodash.isequal, ms, tiny-typed-emitter and universalify (MIT),
graceful-fs and semver (ISC), argparse (Python Software Foundation License 2.0) and sax
(Blue Oak Model License 1.0.0). Each one's licence is inside `resources/app.asar` at
`node_modules/<name>/`. lazy-val ships no licence file: it is MIT, copyright Vladimir
Krivosheev, <https://github.com/develar/lazy-val>.

## Icons

The player's icons are the Vora web client's, from
<https://github.com/axufuris/VoraMediaServer>, under the same AGPL v3.0.

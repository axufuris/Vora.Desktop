# Vora Desktop

The Windows and Linux app for a [Vora](https://github.com/axufuris/VoraMediaServer) media
server. It is your server's own web client in a window — browsing, settings, admin, music,
radio and Live TV all work as they do in a browser — and it plays video in mpv, with
real HDR output and audio passthrough.

## Status

The shell (the connect page, the web client loaded from your server, trust for a home
server's self-signed certificate, the security lock-down, the `window.voraDesktop` bridge
and the desktop player settings) and the mpv player. Movies, episodes and extras play in
mpv, straight from the file, under the Vora player controls: the web player's look,
drawn inside mpv by `src/player/vora/` so HDR output is untouched (see
[docs/player-parity.md](docs/player-parity.md)). Installers come with the release workflows.

mpv comes from:

- **Windows:** the official mpv release pinned in `scripts/mpv-windows.json`, unpacked
  into `resources/mpv/` by `npm run fetch-mpv` (the installer will bundle it).
- **Linux:** the distribution's mpv, 0.37 or newer (`sudo apt install mpv` and the like).
  Without it, video plays in the web client's built-in player and a banner says what to
  install; focusing the window after installing it is enough.

## Development

Requires Node.js 22.12 or later.

```sh
npm ci
npm run dev
```

`npm run dev` opens the connect page. To work on the web client and the shell together,
start Vora.Web's dev server (`npm run dev` in `VoraMediaServer/src/Vora.Web`, with the API
running in Docker as usual) and point the shell at it:

```sh
VORA_DESKTOP_DEV_URL=http://localhost:5173 npm run dev
```

| Script | Does |
| --- | --- |
| `npm run dev` | Runs the app with hot reload |
| `npm run build` | Builds `out/` |
| `npm start` | Runs the built app |
| `npm test` | Unit tests (Vitest) |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript, main and pages |
| `npm run fetch-mpv` | Downloads the pinned Windows mpv into `resources/mpv/` and checks its SHA-256 |
| `npm run build-icons` | Turns the SVGs in `src/player/icons/` (the web player's) into `src/player/vora/icons.lua` |

`src/main/mpvHost.integration.test.ts` plays a generated video in the real mpv. It runs
when an mpv the app accepts and FFmpeg are found (`VORA_TEST_FFMPEG` points at an FFmpeg
that is not on `PATH`) and is skipped otherwise; `VORA_REQUIRE_MPV=1` makes it fail
instead. CI runs it on Ubuntu 24.04 with the distribution's mpv 0.37.

Set `VORA_CHANNEL=qa` at build or dev time for the QA identity: the client name says
"Vora Desktop QA" and DevTools are on. Prod builds have no DevTools.

In a VS Code terminal, run `unset ELECTRON_RUN_AS_NODE` first (PowerShell:
`Remove-Item Env:ELECTRON_RUN_AS_NODE`). VS Code sets it for its own processes, and with
it Electron starts as plain Node.

The app keeps its data in the usual place for the platform (`%APPDATA%\Vora` on Windows,
`~/.config/Vora` on Linux): the saved servers, trusted certificates, settings, window
position, logs (`logs/vora-desktop.log`, and `logs/mpv.log` for the player) and the folder
for your own mpv settings (`mpv/mpv.conf`, read after Vora's).

## Design

The plan, the bridge contract and the security rules are in the server repo:
[`docs/clients/desktop/`](https://github.com/axufuris/VoraMediaServer/tree/main/docs/clients/desktop).

## Licence

GNU Affero General Public License v3.0, like the server. See [LICENSE](LICENSE).

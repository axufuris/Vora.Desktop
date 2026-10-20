# Vora Desktop — guide for Claude

The design lives in the server repo, not here: **`VoraMediaServer/docs/clients/desktop/`**
(start at its `README.md`, then the numbered docs). Read the doc for what you are working
on before changing code. If this code and those docs disagree, tell Andy, and fix the doc
in VoraMediaServer.

## What this repo is

An Electron shell that loads the Vora web client from the user's own server and plays video
in mpv (doc 04) under a Lua chrome that copies the web player; installers and releases are doc 05.

| Path | Holds |
| --- | --- |
| `src/main/` | The main process: window (`windowManager.ts`), connect flow, certificate trust, settings, logging, IPC router |
| `src/main/mpv*.ts` | The player: finding mpv (`mpvDiscovery.ts`), its settings file and arguments (`mpvConfig.ts`), the JSON IPC (`mpvIpc.ts`), mpv events → `PlayerEvent`s (`mpvPlayback.ts`), the server's track choice → mpv track ids (`mpvTracks.ts`), and the process itself (`mpvHost.ts`) |
| `src/preload/index.ts` | Exposes `window.voraDesktop` to the server's page or `window.voraShell` to the bundled pages, never both, and only what the main process allows |
| `src/shared/bridge.ts` | The bridge contract, a byte-for-byte copy of `VoraMediaServer/src/Vora.Web/src/desktop/desktopBridge.ts` |
| `src/shared/shell.ts` | IPC channel names and the bundled pages' API |
| `src/pages/` | The bundled connect and error pages |
| `src/player/` | What mpv loads: the chrome (`vora/main.lua` for state, input and timers, `view.lua` for the layout, `draw.lua` for ASS drawing, `icons.lua` generated), `input.conf` (every key and mouse event goes to the chrome), `icons/` (the web player's SVGs) and `fonts/` (Inter, SIL OFL) |
| `docs/player-parity.md` | Every web player element and where it is in the desktop player |
| `electron-builder.config.ts` | The installers: one config, QA or prod from `VORA_CHANNEL`, fuses, bundled mpv and player files |
| `src/main/updater.ts`, `updatePolicy.ts` | Auto-update from GitHub Releases, per channel; never prompts during playback |
| `.github/workflows/` | `pr.yml` (checks, mpv, bridge, installers), `package.yml` (the shared packaging), `qa.yml` (a QA prerelease per push to `main`), `release.yml` (prod installers for a published release) |
| `.github/RELEASING.md` | How to release, the unsigned installers, and the Linux release notes |
| `resources/` | Icons, and the Windows mpv (`resources/mpv/`, git-ignored, filled by `npm run fetch-mpv` from the pin in `scripts/mpv-windows.json`) |

## Rules

- **TypeScript is strict.** No `any`. `unknown` only for a caught error. IPC payloads are
  `IpcValue` (`src/main/values.ts`) and go through a validator before use.
- **No comments in code.** Comments in workflow YAML are fine.
- **The bridge contract is defined in Vora.Web.** Change `desktopBridge.ts` there first
  (additive only; bump `DESKTOP_BRIDGE_VERSION` when a member is added), then copy it to
  `src/shared/bridge.ts`. The `Bridge contract` check fails on any difference.
- **The renderer runs code from a network server.** Every `ipcMain` handler goes through
  the access check in `registerBridge` (the server's page or a bundled page) and validates
  its payload (`playerRequests.ts`, `desktopSettings.ts`). Only https links leave the app,
  in the system browser. Never accept a certificate error except a pinned fingerprint for
  a saved Vora server. Never hand mpv or `shell.openPath` a path or address that came from
  the renderer unchecked. Never add `--no-sandbox`, `nodeIntegration` or webviews.
- **No Vora logic in the shell or in Lua.** What plays, when auto-skip fires and what Up
  Next shows are decided in Vora.Web's `usePlaybackController`. The chrome draws
  `PlayerChromeState` and sends `ChromeIntent`s; only volume, mute and fullscreen are its own.
- **The chrome must run on mpv 0.37** (Ubuntu 24.04's). Keep Lua to what that version has,
  and take one value from calls that may return more (`format_json` returns a second
  value there). The `Player with mpv` check runs the chrome in that version.
- **`icons.lua` is generated.** Change an SVG in `src/player/icons/` and run
  `npm run build-icons`; a test fails when the two disagree.
- **State is JSON in `userData`,** written with `writeJson` (temp file, then rename).
- **Ask before adding a dependency** the plan doesn't name.
- **Before pushing:** `npm run lint` (0 errors, 0 warnings), `npm run typecheck`,
  `npm test`, `npm run build`. In a VS Code terminal, unset `ELECTRON_RUN_AS_NODE` before
  starting Electron, or it runs as plain Node.
- **Branch and PR for every change;** `main` is protected.

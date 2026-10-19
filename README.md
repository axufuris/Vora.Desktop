# Vora Desktop

The Windows and Linux app for a [Vora](https://github.com/axufuris/VoraMediaServer) media
server. It is your server's own web client in a window — browsing, settings, admin, music,
radio and Live TV all work as they do in a browser — and it will play video in mpv, with
real HDR output and audio passthrough.

## Status

This is the shell: the connect page, the web client loaded from your server, trust for a
home server's self-signed certificate, the security lock-down, the `window.voraDesktop`
bridge, and the desktop player settings. **The mpv player is not in this build yet**, so
video plays in the web client's built-in player. Installers come with the release workflows.

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

Set `VORA_CHANNEL=qa` at build or dev time for the QA identity: the client name says
"Vora Desktop QA" and DevTools are on. Prod builds have no DevTools.

In a VS Code terminal, run `unset ELECTRON_RUN_AS_NODE` first (PowerShell:
`Remove-Item Env:ELECTRON_RUN_AS_NODE`). VS Code sets it for its own processes, and with
it Electron starts as plain Node.

The app keeps its data in the usual place for the platform (`%APPDATA%\Vora` on Windows,
`~/.config/Vora` on Linux): the saved servers, trusted certificates, settings, window
position, logs (`logs/vora-desktop.log`) and the folder for your own mpv settings.

## Design

The plan, the bridge contract and the security rules are in the server repo:
[`docs/clients/desktop/`](https://github.com/axufuris/VoraMediaServer/tree/main/docs/clients/desktop).

## Licence

GNU Affero General Public License v3.0, like the server. See [LICENSE](LICENSE).

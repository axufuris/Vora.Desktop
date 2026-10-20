# Releasing Vora Desktop

There are two apps, built from the same code:

| | Prod | QA |
| --- | --- | --- |
| Name | Vora | Vora QA |
| App id | `net.getvora.desktop` | `net.getvora.desktop.qa` |
| Linux package | `vora-desktop` | `vora-desktop-qa` |
| Version | `X.Y.Z` | `X.Y.Z-qa.<run>` |
| Comes from | a published GitHub Release (`release.yml`) | every push to `main` (`qa.yml`) |
| Updates from | releases (`latest.yml`) | QA prereleases (`qa.yml`) |

Both install side by side, keep their own settings, and never update into each other.
`VORA_CHANNEL=qa` at build time makes the QA app (`electron-builder.config.ts`).

## What each release holds

| File | For |
| --- | --- |
| `Vora-Setup-X.Y.Z.exe` | Windows 10 and 11, per user, no admin; updates itself |
| `Vora-X.Y.Z.AppImage` | any Linux distribution; updates itself |
| `vora-desktop_X.Y.Z_amd64.deb` | Debian, Ubuntu, Mint; installs mpv with it; tells the user about updates |
| `vora-desktop-X.Y.Z.x86_64.rpm` | Fedora, openSUSE, RHEL; installs mpv with it; tells the user about updates |
| `latest.yml`, `latest-linux.yml`, `*.blockmap` | auto-update (`qa.yml`, `qa-linux.yml` for QA). Never delete them from a release |
| `SHA256SUMS.txt` | checksums of everything above |

QA files have `QA` / `-qa` in their names.

## Releasing

1. Merge to `main`. A QA prerelease appears in about 20 minutes, and QA installs update to it.
2. Run the QA plan (`VoraMediaServer/docs/clients/desktop/06-qa-plan.md`) on that build, on
   Windows and the Linux box.
3. Make sure `package.json`'s `version` is the version you are releasing. Create a GitHub
   Release with the tag `v` + that version on `main`, write the notes, and publish it.
4. `release.yml` builds and attaches the installers (about 20 minutes). The release has no
   downloads until it finishes, and it fails if the tag and `package.json` disagree.
5. Install the prod build and play something. Prod installs update on their own.
6. If getvora.net links to particular files, update them (`releases/latest` needs nothing).
7. Open a PR that bumps `package.json` to the next version.

QA keeps the ten newest prereleases and deletes older ones with their tags.

## Secrets

None. The workflows use the built-in `GITHUB_TOKEN`.

## Unsigned installers

Neither the Windows installer nor the Linux packages are signed; `SHA256SUMS.txt` is
published with every release. Say this in the release notes:

- Opening the Windows installer shows SmartScreen's "Windows protected your PC". Choose
  **More info**, then **Run anyway**. Edge or Chrome may first say the file isn't commonly
  downloaded; choose to keep it.
- Updates still install on their own. electron-updater checks each download against the
  SHA-512 in `latest.yml` (`qa.yml` for QA), and the installed `app-update.yml` names no
  publisher, so there is no signature to check.

## Linux notes for release notes

- The AppImage needs FUSE 2 on some distributions: `sudo apt install libfuse2` (Ubuntu 22.04)
  or `libfuse2t64` (Ubuntu 24.04 and later).
- Ubuntu 24.04 and later restrict unprivileged user namespaces, which can stop Electron's
  sandbox from starting in an AppImage. Vora Desktop never turns the sandbox off, so on
  Ubuntu recommend the `.deb`. It sets up `chrome-sandbox` and installs mpv.
- The `.deb` and `.rpm` depend on `mpv`. Ubuntu 24.04's mpv is 0.37, the oldest the Vora
  player accepts.
- Fedora's own mpv uses `ffmpeg-free`, which has no HEVC or AAC decoder. Vora then
  transcodes those files on the server. For direct play, install mpv with RPM Fusion's
  `ffmpeg`.

## Updating the bundled mpv (Windows)

Change `scripts/mpv-windows.json`: the release zip, its URL and SHA-256, and the licence files
from the same tag. Run `npm run fetch-mpv`, update `THIRD-PARTY-NOTICES.md`, and open a PR. QA
tests the new mpv like any other change.

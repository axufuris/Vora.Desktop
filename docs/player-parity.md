# Player parity: the web player and the Vora player in mpv

Every in-player element of Vora.Web's `GlobalVideoPlayer`, `Controls/` and `Panels/`, and
where it lives in the desktop player. The view copies the web player; what plays is decided
by the server and Vora.Web's `usePlaybackController`, never here.

Ticked items are in `src/player/vora/`. "Web window" means the item stays in the app window,
which comes back when mpv closes.

## Header

- [x] Back button (top left, round) → `exit` intent; the web client closes the session
- [x] Title, and the episode line under it
- [x] Stream chips under the title: resolution · HDR · video codec · audio codec ·
      channels · container · bitrate, built from the `info` rows the web client sends
- [ ] Minimize to the mini player: not applicable, mpv is its own window (the app window
      shows the small "Playing in the Vora player" bar)

## Transport

- [x] Elapsed time, seek bar, total time
- [x] Seek bar: drag to scrub, one seek on release (`seek` intent), marker bands
      (Intro / Recap: light; Credits / Credits scene / Preview: blue), hover shows the time
- [x] Scrub thumbnails from the server's sprite above the seek bar while hovering or scrubbing
- [x] Previous episode, back 10 s, play / pause (accent circle), forward 30 s, next episode;
      the episode buttons show when there is a previous or next episode, the missing one dimmed
- [x] Media info button → the Info panel (`info` rows)
- [x] Subtitles button (filled when a subtitle shows) → the Subtitles panel
- [x] Settings button → the Settings panel (Quality, Audio)
- [x] Volume button and slider (desktop-only addition; mpv's own volume, not sent to the server)
- [x] Fullscreen toggle (desktop-only: windowed / fullscreen)
- [x] Auto-hide after 3 s of no input while playing, with the top and bottom scrims;
      kept open while paused, while a panel is open, and while the up-next card shows
- [x] Click on the picture plays / pauses; double-click on the picture toggles fullscreen
      (two quick clicks on two buttons do not)
- [x] Key indicator in the middle of the picture for play / pause, seeks and volume

## Prompts

- [x] Skip Intro / Recap / Preview / Credits / commercial chip (accent), bottom right;
      auto-skip is the controller's, so it needs nothing here
- [x] Up-next card when the episode ends: next title and episode line, countdown,
      Play now, Cancel (`play-next`, `cancel-up-next`)

## Panels

- [x] Settings: Quality (the versions, with the playing one marked, and what plays now,
      e.g. "4K · HDR10 · Direct Play") and Audio tracks; a pick sends
      `select-quality` / `select-audio` at once (the web panel has Apply; one press is the
      remote-friendly form of the same choice)
- [x] Subtitles: Off and every track, the selected one marked → `select-subtitle`
- [ ] Find subtitles online: a form, so it stays in the web window. Not reachable from
      mpv yet: it needs a new chrome intent (a bridge change in Vora.Web first). Until
      then, find subtitles on the title's page or from the web player
- [x] Info: the `info` rows (method, video, audio, container, bitrate, output from
      mpv's `video-out-params`, decoder)

## States

- [x] Loading / buffering spinner (`status: 'loading'`, or mpv waiting for its cache)
- [x] Error: the message and Back; the web window then offers the built-in player
- [ ] "Loading subtitles…" chip: not sent in `PlayerChromeState`; a sidecar subtitle
      appears when it arrives

## Keys and remote

- [x] Space / Enter / Play-Pause: play / pause (Enter also shows the chrome)
- [x] Left / Right with the chrome hidden: back 10 s / forward 30 s; with it shown, move
      focus, and on the seek bar scrub with thumbnails, Enter seeks
- [x] Up / Down: show the chrome, move between rows and panel lists
- [x] Esc / Backspace / Back: close a panel, then hide the chrome, then `exit`
- [x] Wheel, 9 / 0: volume; M: mute; F / F11 / double-click: fullscreen
- [x] Next / Previous media keys: next / previous episode
- [x] Focus shows as the accent fill the web client uses, not an outline

## Theme

- [x] Accent, surface and text colours from the active template (`theme` in the state)
- [x] Inter, the web client's UI font, bundled for the chrome
- [x] White UI capped at about 80% so it isn't blinding over HDR output

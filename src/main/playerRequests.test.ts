import { describe, expect, it } from 'vitest';
import type { PlayerChromeState } from '../shared/bridge';
import { chromeIntentFrom, chromeStateFrom, openRequestFrom, playerCommandFrom, scrubSpriteFrom } from './playerRequests';
import type { IpcValue } from './values';

const server = 'https://vora.example.com';
const request = {
    url: 'https://vora.example.com/api/streaming/play/session-1?t=signed',
    startSeconds: 754,
    title: 'Pilot',
    audioTrack: { position: 1, codec: 'truehd', language: 'eng' },
    subtitleTrack: null,
};

describe('a request to open the Vora player', () => {
    it('is taken when it plays from the connected server', () => {
        expect(openRequestFrom(request, server)).toEqual(request);
    });

    it('is refused for any other address, so mpv never opens a local file or another site', () => {
        expect(openRequestFrom({ ...request, url: 'file:///C:/Users/me/secret.mkv' }, server)).toBeNull();
        expect(openRequestFrom({ ...request, url: 'https://evil.example.com/a.mkv' }, server)).toBeNull();
        expect(openRequestFrom({ ...request, url: 'http://vora.example.com/api/streaming/play/1' }, server)).toBeNull();
        expect(openRequestFrom(request, null)).toBeNull();
    });

    it('is refused when a field is wrong or extra', () => {
        expect(openRequestFrom({ ...request, startSeconds: -5 }, server)).toBeNull();
        expect(openRequestFrom({ ...request, audioTrack: { position: 1.5, codec: null, language: null } }, server)).toBeNull();
        expect(openRequestFrom({ ...request, mpvArguments: '--script=evil.lua' }, server)).toBeNull();
    });
});

describe('a player command', () => {
    it('is taken in each of its forms', () => {
        expect(playerCommandFrom({ type: 'pause' }, server)).toEqual({ type: 'pause' });
        expect(playerCommandFrom({ type: 'seek', seconds: 90 }, server)).toEqual({ type: 'seek', seconds: 90 });
        expect(playerCommandFrom({ type: 'tracks', subtitleTrack: null }, server)).toEqual({ type: 'tracks', subtitleTrack: null });
        expect(playerCommandFrom({ type: 'sub-add', subtitle: { title: 'English', vtt: 'WEBVTT' } }, server)).toEqual({ type: 'sub-add', subtitle: { title: 'English', vtt: 'WEBVTT' } });
        expect(playerCommandFrom({ type: 'load-next', request }, server)).toEqual({ type: 'load-next', request });
    });

    it('is refused when it is not one the player knows', () => {
        expect(playerCommandFrom({ type: 'run', command: 'quit' }, server)).toBeNull();
        expect(playerCommandFrom({ type: 'seek', seconds: Number.NaN }, server)).toBeNull();
        expect(playerCommandFrom({ type: 'load-next', request: { ...request, url: 'https://evil.example.com/' } }, server)).toBeNull();
        expect(playerCommandFrom('pause', server)).toBeNull();
    });
});

describe('the scrub thumbnails', () => {
    it('are taken as the sprite bytes and the cue grid', () => {
        const image = new ArrayBuffer(16);

        expect(scrubSpriteFrom({ image, cueWidth: 240, cueHeight: 135, cues: [{ start: 0, end: 10, x: 0, y: 0 }] }))
            .toEqual({ image, cueWidth: 240, cueHeight: 135, cues: [{ start: 0, end: 10, x: 0, y: 0 }] });
        expect(scrubSpriteFrom(null)).toBeNull();
    });

    it('are refused when they are not', () => {
        expect(scrubSpriteFrom({ image: 'C:/sprite.jpg', cueWidth: 240, cueHeight: 135, cues: [] })).toBeUndefined();
        expect(scrubSpriteFrom({ image: new ArrayBuffer(4), cueWidth: 0, cueHeight: 135, cues: [] })).toBeUndefined();
        expect(scrubSpriteFrom({ image: new ArrayBuffer(4), cueWidth: 240, cueHeight: 135, cues: [{ start: -1, end: 1, x: 0, y: 0 }] })).toBeUndefined();
    });
});

const chrome: PlayerChromeState = {
    title: 'I Love My Country',
    subtitle: 'S2 E2 - Lioness',
    theme: { accent: '#e8a33d', surface: '#16161d', text: '#f4f4f6', textMuted: '#9a9aa8' },
    status: 'playing',
    statusText: null,
    markers: [{ kind: 'Intro', start: 30, end: 90 }],
    skip: { label: 'Skip Intro' },
    upNext: { title: 'Shatter the Moon', subtitle: null, countdownSeconds: 8 },
    audio: [{ id: 'a1', label: 'English', detail: 'TrueHD 7.1', selected: true }],
    subtitles: [{ id: 's1', label: 'English', detail: null, selected: false }],
    quality: { options: [{ id: 'v1', label: '4K · HDR10', selected: true }], currentLabel: '4K · HDR10 · Direct Play' },
    info: [{ label: 'Playback', value: 'Direct Play' }],
    canPlayNext: true,
    canPlayPrevious: false,
};

const asIpc = (value: PlayerChromeState): IpcValue => JSON.parse(JSON.stringify(value));

describe('the player chrome state', () => {
    it('passes a state the web client builds', () => {
        expect(chromeStateFrom(asIpc(chrome))).toEqual(chrome);
        expect(chromeStateFrom(asIpc({ ...chrome, skip: null, upNext: null, status: 'error', statusText: 'Stopped' }))).not.toBeNull();
    });

    it('refuses a state with something the chrome cannot draw', () => {
        expect(chromeStateFrom({ ...asIpc(chrome) as Record<string, IpcValue>, status: 'dancing' })).toBeNull();
        expect(chromeStateFrom({ ...asIpc(chrome) as Record<string, IpcValue>, title: 'x'.repeat(501) })).toBeNull();
        expect(chromeStateFrom({ ...asIpc(chrome) as Record<string, IpcValue>, markers: [{ kind: 'Ads', start: 0, end: 1 }] })).toBeNull();
        expect(chromeStateFrom({ ...asIpc(chrome) as Record<string, IpcValue>, audio: Array.from({ length: 201 }, () => ({ id: 'a', label: 'a', detail: null, selected: false })) })).toBeNull();
        expect(chromeStateFrom({ ...asIpc(chrome) as Record<string, IpcValue>, canPlayNext: 'yes' })).toBeNull();
        expect(chromeStateFrom('state')).toBeNull();
    });
});

describe('what the player chrome asks for', () => {
    it('takes the intents the web client handles', () => {
        expect(chromeIntentFrom({ type: 'seek', to: 42 })).toEqual({ type: 'seek', to: 42 });
        expect(chromeIntentFrom({ type: 'select-subtitle', id: null })).toEqual({ type: 'select-subtitle', id: null });
        expect(chromeIntentFrom({ type: 'select-audio', id: 'a2' })).toEqual({ type: 'select-audio', id: 'a2' });
        expect(chromeIntentFrom({ type: 'exit' })).toEqual({ type: 'exit' });
    });

    it('refuses anything else', () => {
        expect(chromeIntentFrom({ type: 'exit', now: true })).toBeNull();
        expect(chromeIntentFrom({ type: 'seek', to: -1 })).toBeNull();
        expect(chromeIntentFrom({ type: 'select-audio', id: 3 })).toBeNull();
        expect(chromeIntentFrom({ type: 'format-disk' })).toBeNull();
    });
});

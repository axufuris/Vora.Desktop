import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ADVANCED_MPV_HEADER, DefaultSettings, DesktopSettingsStore, settingsPatchFrom } from './desktopSettings';

let folder = '';

beforeEach(() => {
    folder = mkdtempSync(join(tmpdir(), 'vora-settings-'));
});

afterEach(() => {
    rmSync(folder, { recursive: true, force: true });
});

describe('the desktop settings', () => {
    it('start with the Vora player on, passthrough off, HDR on, hardware decoding automatic and videos in full screen', () => {
        expect(new DesktopSettingsStore(folder).get()).toEqual({ useMpvForVideo: true, audioPassthrough: 'off', hdrOutput: true, hardwareDecoding: 'auto', startFullScreen: true });
    });

    it('remember a choice to play videos in a window', () => {
        new DesktopSettingsStore(folder).set({ startFullScreen: false });

        expect(new DesktopSettingsStore(folder).get().startFullScreen).toBe(false);
    });

    it('keep videos in full screen for a settings file saved before the choice existed', () => {
        writeFileSync(join(folder, 'settings.json'), JSON.stringify({ useMpvForVideo: true, audioPassthrough: 'core', hdrOutput: true, hardwareDecoding: 'auto' }));

        expect(new DesktopSettingsStore(folder).get()).toEqual({ ...DefaultSettings, audioPassthrough: 'core', startFullScreen: true });
    });

    it('keep a change across restarts', () => {
        new DesktopSettingsStore(folder).set({ audioPassthrough: 'all', hdrOutput: false });

        expect(new DesktopSettingsStore(folder).get()).toEqual({ ...DefaultSettings, audioPassthrough: 'all', hdrOutput: false });
    });

    it('fall back to the default for anything damaged in the file', () => {
        writeFileSync(join(folder, 'settings.json'), JSON.stringify({ useMpvForVideo: 'yes', audioPassthrough: 'core', hardwareDecoding: 'gpu' }));

        expect(new DesktopSettingsStore(folder).get()).toEqual({ ...DefaultSettings, audioPassthrough: 'core' });
    });

    it('create the advanced mpv settings file once, with an explanation', () => {
        const store = new DesktopSettingsStore(folder);
        const advanced = store.ensureAdvancedFolder();
        writeFileSync(join(advanced, 'mpv.conf'), `${ADVANCED_MPV_HEADER}volume=80\n`);

        store.ensureAdvancedFolder();

        expect(readFileSync(join(advanced, 'mpv.conf'), 'utf8')).toBe(`${ADVANCED_MPV_HEADER}volume=80\n`);
    });
});

describe('a settings change sent by the page', () => {
    it('is taken field by field', () => {
        expect(settingsPatchFrom({ audioPassthrough: 'core' })).toEqual({ audioPassthrough: 'core' });
        expect(settingsPatchFrom({ useMpvForVideo: false, hardwareDecoding: 'off' })).toEqual({ useMpvForVideo: false, hardwareDecoding: 'off' });
        expect(settingsPatchFrom({ startFullScreen: false })).toEqual({ startFullScreen: false });
    });

    it('is refused when a value or a name is not one the app knows', () => {
        expect(settingsPatchFrom({ audioPassthrough: 'dts-only' })).toBeNull();
        expect(settingsPatchFrom({ hdrOutput: 'true' })).toBeNull();
        expect(settingsPatchFrom({ startFullScreen: 'no' })).toBeNull();
        expect(settingsPatchFrom({ mpvPath: 'C:\\evil\\mpv.exe' })).toBeNull();
        expect(settingsPatchFrom('useMpvForVideo')).toBeNull();
        expect(settingsPatchFrom(null)).toBeNull();
    });
});

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AudioPassthrough, DesktopSettings, HardwareDecoding } from '../shared/bridge';
import { readJson, writeJson } from './jsonFile';
import type { IpcValue, JsonValue } from './values';
import { hasOnlyKeys, isRecord } from './values';

export const DefaultSettings: DesktopSettings = {
    useMpvForVideo: true,
    audioPassthrough: 'off',
    hdrOutput: true,
    hardwareDecoding: 'auto',
};

const SETTING_KEYS = Object.keys(DefaultSettings);
const PASSTHROUGH: readonly AudioPassthrough[] = ['off', 'core', 'all'];
const DECODING: readonly HardwareDecoding[] = ['auto', 'off'];

export const ADVANCED_MPV_HEADER = [
    '# Your own mpv settings for Vora Desktop.',
    '# Vora reads this file after its own settings, so anything here wins.',
    '# Options: https://mpv.io/manual/stable/#options',
    '',
].join('\n');

function passthroughOf(value: IpcValue): AudioPassthrough | undefined {
    return PASSTHROUGH.find(choice => choice === value);
}

function decodingOf(value: IpcValue): HardwareDecoding | undefined {
    return DECODING.find(choice => choice === value);
}

export function settingsPatchFrom(value: IpcValue): Partial<DesktopSettings> | null {
    if (!isRecord(value) || !hasOnlyKeys(value, SETTING_KEYS)) return null;
    const patch: Partial<DesktopSettings> = {};
    if (value.useMpvForVideo !== undefined) {
        if (typeof value.useMpvForVideo !== 'boolean') return null;
        patch.useMpvForVideo = value.useMpvForVideo;
    }
    if (value.hdrOutput !== undefined) {
        if (typeof value.hdrOutput !== 'boolean') return null;
        patch.hdrOutput = value.hdrOutput;
    }
    if (value.audioPassthrough !== undefined) {
        const passthrough = passthroughOf(value.audioPassthrough);
        if (!passthrough) return null;
        patch.audioPassthrough = passthrough;
    }
    if (value.hardwareDecoding !== undefined) {
        const decoding = decodingOf(value.hardwareDecoding);
        if (!decoding) return null;
        patch.hardwareDecoding = decoding;
    }
    return patch;
}

function settingsFrom(value: JsonValue): DesktopSettings {
    if (!isRecord(value)) return DefaultSettings;
    const saved: Partial<DesktopSettings> = {};
    for (const key of SETTING_KEYS) {
        const patch = settingsPatchFrom({ [key]: value[key] });
        if (patch) Object.assign(saved, patch);
    }
    return { ...DefaultSettings, ...saved };
}

export class DesktopSettingsStore {
    private readonly path: string;
    readonly advancedFolder: string;
    private settings: DesktopSettings;

    constructor(userData: string) {
        this.path = join(userData, 'settings.json');
        this.advancedFolder = join(userData, 'mpv');
        this.settings = readJson(this.path, settingsFrom, DefaultSettings);
    }

    get(): DesktopSettings {
        return { ...this.settings };
    }

    set(patch: Partial<DesktopSettings>): DesktopSettings {
        this.settings = { ...this.settings, ...patch };
        writeJson(this.path, { ...this.settings });
        return this.get();
    }

    ensureAdvancedFolder(): string {
        mkdirSync(this.advancedFolder, { recursive: true });
        const conf = join(this.advancedFolder, 'mpv.conf');
        if (!existsSync(conf)) writeFileSync(conf, ADVANCED_MPV_HEADER, 'utf8');
        return this.advancedFolder;
    }
}

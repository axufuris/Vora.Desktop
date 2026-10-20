import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
    candidatePaths,
    decodersFrom,
    discoverMpv,
    installCommand,
    NO_GPU_NEXT_REASON,
    NO_LUA_REASON,
    parseMpvVersion,
    type Runner,
} from './mpvDiscovery';

const VERSION = 'mpv v0.41.0-dev-g41f6a6450 Copyright © 2000-2025 mpv/MPlayer/mplayer2 projects\n built on Dec 21 2025\n';
const OUTPUTS = 'Available video outputs:\n  gpu-next         Video output based on libplacebo\n  gpu              Shader-based GPU Renderer\n';
const VIDEO_DECODERS = 'Video decoders:\n    h264 - H.264 / AVC\n    hevc - HEVC (High Efficiency Video Coding)\n    libdav1d (av1) - dav1d AV1 decoder by VideoLAN\n';
const AUDIO_DECODERS = 'Audio decoders:\n    dca (dts) - DCA (DTS Coherent Acoustics)\n    truehd - TrueHD\n    mp3float (mp3) - MP3 (MPEG audio layer 3)\n';

function runner(answers: Record<string, string | null>): Runner {
    return (_file, args) => {
        const key = args.find(arg => arg.startsWith('--') && arg !== '--no-config') ?? '';
        const answer = Object.entries(answers).find(([prefix]) => key.startsWith(prefix));
        return Promise.resolve(answer ? answer[1] : null);
    };
}

const healthy = {
    '--version': VERSION,
    '--vo=help': OUTPUTS,
    '--vd=help': VIDEO_DECODERS,
    '--ad=help': AUDIO_DECODERS,
    '--idle': '[lua-probe] vora-lua-ok\nExiting... (Quit)\n',
};

const options = (run: Runner, platform: 'windows' | 'linux' = 'linux', osRelease: string | null = null) => ({
    platform,
    bundledFolder: 'C:\\Program Files\\Vora\\resources\\mpv',
    pathVariable: '/usr/bin',
    probeFolder: mkdtempSync(join(tmpdir(), 'vora-probe-')),
    osRelease,
    run,
});

describe('reading what mpv says about itself', () => {
    it('reads a release, a git build and a distribution build', () => {
        expect(parseMpvVersion(VERSION)).toEqual({ major: 0, minor: 41, patch: 0, label: '0.41.0-dev-g41f6a6450' });
        expect(parseMpvVersion('mpv 0.37.0 Copyright © 2000-2023 mpv/MPlayer/mplayer2 projects')).toEqual({ major: 0, minor: 37, patch: 0, label: '0.37.0' });
        expect(parseMpvVersion('mpv 0.35.1-dirty Copyright')).toMatchObject({ major: 0, minor: 35, patch: 1 });
        expect(parseMpvVersion('bash: mpv: command not found')).toBeNull();
    });

    it('takes the codec a decoder plays, not the decoder name', () => {
        expect([...decodersFrom(VIDEO_DECODERS)]).toEqual(['h264', 'hevc', 'av1']);
        expect([...decodersFrom(AUDIO_DECODERS)]).toEqual(['dts', 'truehd', 'mp3']);
    });

    it('names the install command for the family of the distribution', () => {
        expect(installCommand('ID=ubuntu\nID_LIKE=debian\n')).toBe('sudo apt install mpv');
        expect(installCommand('ID=linuxmint\nID_LIKE="ubuntu debian"\n')).toBe('sudo apt install mpv');
        expect(installCommand('ID=fedora\n')).toBe('sudo dnf install mpv');
        expect(installCommand('ID="rocky"\nID_LIKE="rhel centos fedora"\n')).toBe('sudo dnf install mpv');
        expect(installCommand('ID=endeavouros\nID_LIKE=arch\n')).toBe('sudo pacman -S mpv');
        expect(installCommand('ID="opensuse-tumbleweed"\nID_LIKE="opensuse suse"\n')).toBe('sudo zypper install mpv');
        expect(installCommand('ID=nixos\n')).toBeNull();
        expect(installCommand(null)).toBeNull();
    });

    it('uses the bundled mpv on Windows and the system one on Linux', () => {
        expect(candidatePaths('windows', 'C:\\Vora\\resources\\mpv', 'C:\\Windows')).toEqual([join('C:\\Vora\\resources\\mpv', 'mpv.exe')]);
        expect(candidatePaths('linux', '/opt/Vora/resources/mpv', ['/home/me/.local/bin', '/usr/bin'].join(':'))).toContain('/usr/local/bin/mpv');
    });
});

describe('finding mpv', () => {
    it('finds an mpv that plays, with what it can decode', async () => {
        const found = await discoverMpv(options(runner(healthy)));

        expect(found.status).toEqual({ available: true, version: '0.41.0-dev-g41f6a6450', reason: null });
        expect(found.binary?.videoDecoders.has('av1')).toBe(true);
        expect(found.binary?.audioDecoders.has('dts')).toBe(true);
    });

    it('tells a Linux user how to install mpv when there is none', async () => {
        const found = await discoverMpv(options(runner({}), 'linux', 'ID=ubuntu\nID_LIKE=debian\n'));

        expect(found.status).toEqual({ available: false, version: null, reason: "The Vora player needs mpv, which isn't installed. Install it with sudo apt install mpv." });
        expect(found.binary).toBeNull();
    });

    it('sends a Windows user back to the installer when the bundled mpv is gone', async () => {
        const found = await discoverMpv(options(runner({}), 'windows'));

        expect(found.status.reason).toContain('Reinstall Vora Desktop');
    });

    it('turns down an mpv too old to play', async () => {
        const found = await discoverMpv(options(runner({ ...healthy, '--version': 'mpv 0.35.1 Copyright' }), 'linux', 'ID=debian\n'));

        expect(found.status.available).toBe(false);
        expect(found.status.reason).toBe('This computer has mpv 0.35.1, and the Vora player needs 0.37 or newer. Update it with sudo apt install mpv, or install a newer mpv from your distribution.');
    });

    it('turns down an mpv built without Lua or without gpu-next', async () => {
        expect((await discoverMpv(options(runner({ ...healthy, '--idle': 'Error: unknown script' })))).status.reason).toBe(NO_LUA_REASON);
        expect((await discoverMpv(options(runner({ ...healthy, '--vo=help': 'Available video outputs:\n  gpu   Shader-based\n' })))).status.reason).toBe(NO_GPU_NEXT_REASON);
    });
});

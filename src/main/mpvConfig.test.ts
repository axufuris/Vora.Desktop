import { describe, expect, it } from 'vitest';
import type { DesktopSettings } from '../shared/bridge';
import { DefaultSettings } from './desktopSettings';
import { ipcPathFor, mpvLaunchArguments, mpvPathValue, runtimeMpvConf, spdifCodecs } from './mpvConfig';

const conf = (settings: Partial<DesktopSettings>, platform: 'windows' | 'linux' = 'linux') =>
    runtimeMpvConf({ platform, settings: { ...DefaultSettings, ...settings }, advancedConf: '/home/me/.config/Vora/mpv/mpv.conf' }).split('\n');

describe('the mpv settings Vora writes', () => {
    it('outputs HDR with the hardware decoder and tracks chosen by Vora, ending with the user\'s own file', () => {
        const lines = conf({});

        expect(lines).toEqual(expect.arrayContaining(['vo=gpu-next', 'hwdec=auto-safe', 'target-colorspace-hint=yes', 'sub-auto=no', 'audio-file-auto=no', 'ytdl=no']));
        expect(lines.filter(Boolean).at(-1)).toBe('include=%34%/home/me/.config/Vora/mpv/mpv.conf');
        expect(lines).not.toContain('gpu-api=d3d11');
    });

    it('follows the desktop settings', () => {
        expect(conf({ hardwareDecoding: 'off', hdrOutput: false })).toEqual(expect.arrayContaining(['hwdec=no', 'target-colorspace-hint=no']));
        expect(conf({ audioPassthrough: 'all' }, 'windows')).toEqual(expect.arrayContaining(['gpu-api=d3d11', 'audio-spdif=ac3,dts,eac3,truehd,dts-hd', 'audio-exclusive=yes']));
        expect(conf({ audioPassthrough: 'core' })).toContain('audio-spdif=ac3,dts');
        expect(conf({ audioPassthrough: 'core' })).not.toContain('audio-exclusive=yes');
        expect(conf({}).some(line => line.startsWith('audio-spdif'))).toBe(false);
        expect(spdifCodecs('off')).toBeNull();
    });

    it('writes a path with spaces and non-ASCII letters in mpv\'s length-prefixed form', () => {
        expect(mpvPathValue('C:\\Users\\Zoë Smith\\mpv.conf')).toBe('%28%C:\\Users\\Zoë Smith\\mpv.conf');
    });
});

describe('starting mpv', () => {
    it('isolates it from the user\'s own mpv and verifies certificates unless the server\'s is pinned', () => {
        const args = mpvLaunchArguments({ configFolder: '/cfg', ipcPath: '/run/user/1000/vora-mpv-1-1.sock', logFile: '/logs/mpv.log', verifyTls: true });

        expect(args).toEqual(['--config-dir=/cfg', '--load-scripts=no', '--input-ipc-server=/run/user/1000/vora-mpv-1-1.sock', '--idle=yes', '--force-window=yes', '--keep-open=yes', '--log-file=/logs/mpv.log', '--tls-verify=yes']);
        expect(mpvLaunchArguments({ configFolder: '/cfg', ipcPath: 'p', logFile: 'l', verifyTls: false, extraArguments: ['--vo=null'] }).slice(-2)).toEqual(['--tls-verify=no', '--vo=null']);
    });

    it('talks to it over a named pipe on Windows and a socket on Linux', () => {
        expect(ipcPathFor('windows', 4242, 3, 'unused')).toBe('\\\\.\\pipe\\vora-mpv-4242-3');
        expect(ipcPathFor('linux', 4242, 3, '/run/user/1000')).toMatch(/vora-mpv-4242-3\.sock$/);
    });
});

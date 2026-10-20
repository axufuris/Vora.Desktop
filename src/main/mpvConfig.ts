import { join } from 'node:path';
import type { AudioPassthrough, DesktopPlatform, DesktopSettings } from '../shared/bridge';

export interface RuntimeConfigInput {
    platform: DesktopPlatform;
    settings: DesktopSettings;
    advancedConf: string;
}

export interface LaunchInput {
    configFolder: string;
    ipcPath: string;
    logFile: string;
    verifyTls: boolean;
    extraArguments?: readonly string[];
}

export function mpvPathValue(value: string): string {
    return `%${Buffer.byteLength(value, 'utf8')}%${value}`;
}

export function spdifCodecs(passthrough: AudioPassthrough): string | null {
    switch (passthrough) {
        case 'core':
            return 'ac3,dts';
        case 'all':
            return 'ac3,dts,eac3,truehd,dts-hd';
        case 'off':
            return null;
    }
}

export function runtimeMpvConf({ platform, settings, advancedConf }: RuntimeConfigInput): string {
    const spdif = spdifCodecs(settings.audioPassthrough);
    const lines = [
        'title=Vora',
        'fullscreen=yes',
        'vo=gpu-next',
        `hwdec=${settings.hardwareDecoding === 'off' ? 'no' : 'auto-safe'}`,
        `target-colorspace-hint=${settings.hdrOutput ? 'yes' : 'no'}`,
        'tone-mapping=auto',
        'hdr-compute-peak=auto',
        ...(platform === 'windows' ? ['gpu-api=d3d11'] : []),
        'audio-channels=auto',
        ...(spdif ? [`audio-spdif=${spdif}`] : []),
        ...(spdif && platform === 'windows' ? ['audio-exclusive=yes'] : []),
        'sub-auto=no',
        'audio-file-auto=no',
        'cache=yes',
        'demuxer-max-bytes=512MiB',
        'demuxer-readahead-secs=60',
        'network-timeout=30',
        'save-position-on-quit=no',
        'ytdl=no',
        `include=${mpvPathValue(advancedConf)}`,
    ];
    return `${lines.join('\n')}\n`;
}

export function mpvLaunchArguments({ configFolder, ipcPath, logFile, verifyTls, extraArguments = [] }: LaunchInput): string[] {
    return [
        `--config-dir=${configFolder}`,
        '--load-scripts=no',
        `--input-ipc-server=${ipcPath}`,
        '--idle=yes',
        '--force-window=yes',
        '--keep-open=yes',
        `--log-file=${logFile}`,
        `--tls-verify=${verifyTls ? 'yes' : 'no'}`,
        ...extraArguments,
    ];
}

export function ipcPathFor(platform: DesktopPlatform, pid: number, run: number, runtimeFolder: string): string {
    const name = `vora-mpv-${pid}-${run}`;
    return platform === 'windows' ? `\\\\.\\pipe\\${name}` : join(runtimeFolder, `${name}.sock`);
}

import type { DesktopCapabilities } from '../shared/bridge';

export const DESKTOP_VIDEO_CODECS = ['h264', 'hevc', 'av1', 'vp9', 'vp8', 'mpeg2video', 'mpeg4', 'vc1'];

export const DESKTOP_AUDIO_CODECS = [
    'aac', 'ac3', 'eac3', 'truehd', 'dts', 'flac', 'opus', 'vorbis', 'mp3',
    'pcm_s16le', 'pcm_s24le', 'pcm_s32le', 'pcm_f32le', 'pcm_bluray', 'pcm_dvd',
];

export const DESKTOP_CONTAINERS = ['mkv', 'mp4', 'avi', 'm4v', 'mov', 'mts', 'm2ts', '3gp', 'mpg', 'mpeg', 'wmv', 'webm', 'ts'];

export interface DisplaySize {
    width: number;
    height: number;
}

export function desktopCapabilities(display: DisplaySize): DesktopCapabilities {
    return {
        videoCodecs: DESKTOP_VIDEO_CODECS,
        audioCodecs: DESKTOP_AUDIO_CODECS,
        containers: DESKTOP_CONTAINERS,
        maxAudioChannels: 8,
        detectedAudioChannels: 8,
        displayWidth: Math.max(display.width, display.height),
        displayHeight: Math.min(display.width, display.height),
    };
}

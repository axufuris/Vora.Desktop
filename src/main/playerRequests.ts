import type { OpenRequest, PlayerCommand, ScrubSpriteSpec, TrackRef } from '../shared/bridge';
import { isServerPage } from './navigation';
import type { IpcValue } from './values';
import { hasOnlyKeys, isFiniteNumber, isRecord, stringOrNull } from './values';

const MAX_URL = 4096;
const MAX_TITLE = 500;
const MAX_VTT = 20 * 1024 * 1024;
const MAX_SPRITE = 64 * 1024 * 1024;
const MAX_CUES = 100_000;

function trackRefFrom(value: IpcValue): TrackRef | undefined {
    if (!isRecord(value) || !hasOnlyKeys(value, ['position', 'codec', 'language'])) return undefined;
    const { position } = value;
    if (!isFiniteNumber(position) || !Number.isInteger(position) || position < 0 || position > 999) return undefined;
    const codec = stringOrNull(value.codec, 64);
    const language = stringOrNull(value.language, 64);
    if (codec === undefined || language === undefined) return undefined;
    return { position, codec, language };
}

function optionalTrackRef(value: IpcValue): TrackRef | null | undefined {
    return value === null ? null : trackRefFrom(value);
}

export function openRequestFrom(value: IpcValue, serverOrigin: string | null): OpenRequest | null {
    if (!isRecord(value) || !hasOnlyKeys(value, ['url', 'startSeconds', 'title', 'audioTrack', 'subtitleTrack'])) return null;
    const { url, startSeconds, title } = value;
    if (typeof url !== 'string' || url.length > MAX_URL || !isServerPage(url, serverOrigin)) return null;
    if (!isFiniteNumber(startSeconds) || startSeconds < 0) return null;
    if (typeof title !== 'string' || title.length > MAX_TITLE) return null;
    const audioTrack = optionalTrackRef(value.audioTrack);
    const subtitleTrack = optionalTrackRef(value.subtitleTrack);
    if (audioTrack === undefined || subtitleTrack === undefined) return null;
    return { url, startSeconds, title, audioTrack, subtitleTrack };
}

export function playerCommandFrom(value: IpcValue, serverOrigin: string | null): PlayerCommand | null {
    if (!isRecord(value)) return null;
    switch (value.type) {
        case 'play':
        case 'pause':
            return hasOnlyKeys(value, ['type']) ? { type: value.type } : null;
        case 'seek':
            return hasOnlyKeys(value, ['type', 'seconds']) && isFiniteNumber(value.seconds) && value.seconds >= 0
                ? { type: 'seek', seconds: value.seconds }
                : null;
        case 'tracks': {
            if (!hasOnlyKeys(value, ['type', 'audioTrack', 'subtitleTrack'])) return null;
            const command: PlayerCommand = { type: 'tracks' };
            if (value.audioTrack !== undefined) {
                const audioTrack = trackRefFrom(value.audioTrack);
                if (!audioTrack) return null;
                command.audioTrack = audioTrack;
            }
            if (value.subtitleTrack !== undefined) {
                const subtitleTrack = optionalTrackRef(value.subtitleTrack);
                if (subtitleTrack === undefined) return null;
                command.subtitleTrack = subtitleTrack;
            }
            return command;
        }
        case 'sub-add': {
            const subtitle = value.subtitle;
            if (!hasOnlyKeys(value, ['type', 'subtitle']) || !isRecord(subtitle) || !hasOnlyKeys(subtitle, ['title', 'vtt'])) return null;
            const { title, vtt } = subtitle;
            if (typeof title !== 'string' || title.length > MAX_TITLE || typeof vtt !== 'string' || vtt.length > MAX_VTT) return null;
            return { type: 'sub-add', subtitle: { title, vtt } };
        }
        case 'load-next': {
            if (!hasOnlyKeys(value, ['type', 'request'])) return null;
            const request = openRequestFrom(value.request, serverOrigin);
            return request ? { type: 'load-next', request } : null;
        }
        default:
            return null;
    }
}

export function scrubSpriteFrom(value: IpcValue): ScrubSpriteSpec | null | undefined {
    if (value === null) return null;
    if (!isRecord(value) || !hasOnlyKeys(value, ['image', 'cueWidth', 'cueHeight', 'cues'])) return undefined;
    const { image, cueWidth, cueHeight, cues } = value;
    if (!(image instanceof ArrayBuffer) || image.byteLength > MAX_SPRITE) return undefined;
    if (!isFiniteNumber(cueWidth) || cueWidth <= 0 || cueWidth > 4096 || !isFiniteNumber(cueHeight) || cueHeight <= 0 || cueHeight > 4096) return undefined;
    if (!Array.isArray(cues) || cues.length > MAX_CUES) return undefined;
    const parsed: ScrubSpriteSpec['cues'] = [];
    for (const cue of cues) {
        if (!isRecord(cue) || !hasOnlyKeys(cue, ['start', 'end', 'x', 'y'])) return undefined;
        const { start, end, x, y } = cue;
        if (!isFiniteNumber(start) || !isFiniteNumber(end) || !isFiniteNumber(x) || !isFiniteNumber(y)) return undefined;
        if (start < 0 || end < 0 || x < 0 || y < 0) return undefined;
        parsed.push({ start, end, x, y });
    }
    return { image, cueWidth, cueHeight, cues: parsed };
}

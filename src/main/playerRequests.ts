import type { ChromeIntent, MarkerKind, OpenRequest, PlayerChromeState, PlayerCommand, ScrubSpriteSpec, TrackOption, TrackRef } from '../shared/bridge';
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

const MAX_INTENT_ID = 200;

export function chromeIntentFrom(value: IpcValue): ChromeIntent | null {
    if (!isRecord(value)) return null;
    switch (value.type) {
        case 'toggle-pause':
        case 'skip-marker':
        case 'play-next':
        case 'play-previous':
        case 'cancel-up-next':
        case 'exit':
            return hasOnlyKeys(value, ['type']) ? { type: value.type } : null;
        case 'seek':
            return hasOnlyKeys(value, ['type', 'to']) && isFiniteNumber(value.to) && value.to >= 0 ? { type: 'seek', to: value.to } : null;
        case 'select-audio':
        case 'select-quality':
            return hasOnlyKeys(value, ['type', 'id']) && typeof value.id === 'string' && value.id.length <= MAX_INTENT_ID
                ? { type: value.type, id: value.id }
                : null;
        case 'select-subtitle': {
            if (!hasOnlyKeys(value, ['type', 'id'])) return null;
            const id = stringOrNull(value.id, MAX_INTENT_ID);
            return id === undefined ? null : { type: 'select-subtitle', id };
        }
        default:
            return null;
    }
}

const MAX_LIST = 200;
const MAX_LABEL = 300;
const MARKER_KINDS: readonly MarkerKind[] = ['Intro', 'Recap', 'Preview', 'Credits', 'CreditsScene'];
const STATUSES: readonly PlayerChromeState['status'][] = ['loading', 'playing', 'error'];

function text(value: IpcValue, maxLength: number): string | undefined {
    return typeof value === 'string' && value.length <= maxLength ? value : undefined;
}

function listOf<T>(value: IpcValue, max: number, item: (entry: IpcValue) => T | undefined): T[] | undefined {
    if (!Array.isArray(value) || value.length > max) return undefined;
    const items: T[] = [];
    for (const entry of value) {
        const parsed = item(entry);
        if (parsed === undefined) return undefined;
        items.push(parsed);
    }
    return items;
}

function trackOptionFrom(value: IpcValue): TrackOption | undefined {
    if (!isRecord(value)) return undefined;
    const id = text(value.id, MAX_INTENT_ID);
    const label = text(value.label, MAX_LABEL);
    const detail = stringOrNull(value.detail, MAX_LABEL);
    if (id === undefined || label === undefined || detail === undefined || typeof value.selected !== 'boolean') return undefined;
    return { id, label, detail, selected: value.selected };
}

function markerFrom(value: IpcValue): PlayerChromeState['markers'][number] | undefined {
    if (!isRecord(value)) return undefined;
    const kind = MARKER_KINDS.find(candidate => candidate === value.kind);
    if (!kind || !isFiniteNumber(value.start) || !isFiniteNumber(value.end)) return undefined;
    return { kind, start: value.start, end: value.end };
}

function qualityOptionFrom(value: IpcValue): PlayerChromeState['quality']['options'][number] | undefined {
    if (!isRecord(value)) return undefined;
    const id = text(value.id, MAX_INTENT_ID);
    const label = text(value.label, MAX_LABEL);
    if (id === undefined || label === undefined || typeof value.selected !== 'boolean') return undefined;
    return { id, label, selected: value.selected };
}

function infoRowFrom(value: IpcValue): PlayerChromeState['info'][number] | undefined {
    if (!isRecord(value)) return undefined;
    const label = text(value.label, MAX_LABEL);
    const rowValue = text(value.value, MAX_LABEL);
    return label === undefined || rowValue === undefined ? undefined : { label, value: rowValue };
}

export function chromeStateFrom(value: IpcValue): PlayerChromeState | null {
    if (!isRecord(value)) return null;
    const { theme, quality, skip, upNext } = value;
    const title = text(value.title, MAX_TITLE);
    const subtitle = stringOrNull(value.subtitle, MAX_TITLE);
    const status = STATUSES.find(candidate => candidate === value.status);
    const statusText = stringOrNull(value.statusText, 1000);
    if (title === undefined || subtitle === undefined || !status || statusText === undefined) return null;
    if (!isRecord(theme) || !isRecord(quality) || typeof value.canPlayNext !== 'boolean' || typeof value.canPlayPrevious !== 'boolean') return null;

    const colours = {
        accent: text(theme.accent, 16),
        surface: text(theme.surface, 16),
        text: text(theme.text, 16),
        textMuted: text(theme.textMuted, 16),
    };
    if (colours.accent === undefined || colours.surface === undefined || colours.text === undefined || colours.textMuted === undefined) return null;

    let skipState: PlayerChromeState['skip'] = null;
    if (skip !== null) {
        const label = isRecord(skip) ? text(skip.label, 100) : undefined;
        if (label === undefined) return null;
        skipState = { label };
    }

    let upNextState: PlayerChromeState['upNext'] = null;
    if (upNext !== null) {
        if (!isRecord(upNext)) return null;
        const nextTitle = text(upNext.title, MAX_TITLE);
        const nextSubtitle = stringOrNull(upNext.subtitle, MAX_TITLE);
        const countdown = upNext.countdownSeconds === null ? null : isFiniteNumber(upNext.countdownSeconds) ? upNext.countdownSeconds : undefined;
        if (nextTitle === undefined || nextSubtitle === undefined || countdown === undefined) return null;
        upNextState = { title: nextTitle, subtitle: nextSubtitle, countdownSeconds: countdown };
    }

    const markers = listOf(value.markers, MAX_LIST, markerFrom);
    const audio = listOf(value.audio, MAX_LIST, trackOptionFrom);
    const subtitles = listOf(value.subtitles, MAX_LIST, trackOptionFrom);
    const options = listOf(quality.options, 50, qualityOptionFrom);
    const currentLabel = text(quality.currentLabel, MAX_LABEL);
    const info = listOf(value.info, 50, infoRowFrom);
    if (!markers || !audio || !subtitles || !options || currentLabel === undefined || !info) return null;

    return {
        title,
        subtitle,
        theme: { accent: colours.accent, surface: colours.surface, text: colours.text, textMuted: colours.textMuted },
        status,
        statusText,
        markers,
        skip: skipState,
        upNext: upNextState,
        audio,
        subtitles,
        quality: { options, currentLabel },
        info,
        canPlayNext: value.canPlayNext,
        canPlayPrevious: value.canPlayPrevious,
    };
}

import type { TrackRef } from '../shared/bridge';
import type { IpcValue, JsonValue } from './values';
import { isRecord } from './values';

export type MpvTrackType = 'video' | 'audio' | 'sub';

export interface MpvTrack {
    id: number;
    type: MpvTrackType;
    external: boolean;
    ffIndex: number | null;
    language: string | null;
    codec: string | null;
    selected: boolean;
}

function text(value: IpcValue): string | null {
    return typeof value === 'string' && value.length > 0 ? value : null;
}

export function tracksFrom(value: JsonValue): MpvTrack[] {
    if (!Array.isArray(value)) return [];
    const tracks: MpvTrack[] = [];
    for (const entry of value) {
        if (!isRecord(entry)) continue;
        const { id, type } = entry;
        if (typeof id !== 'number' || (type !== 'video' && type !== 'audio' && type !== 'sub')) continue;
        tracks.push({
            id,
            type,
            external: entry.external === true,
            ffIndex: typeof entry['ff-index'] === 'number' ? entry['ff-index'] : null,
            language: text(entry.lang),
            codec: text(entry.codec),
            selected: entry.selected === true,
        });
    }
    return tracks;
}

function same(wanted: string | null, actual: string | null): boolean {
    return wanted === null || actual === null || wanted.toLowerCase() === actual.toLowerCase();
}

function fits(track: MpvTrack, ref: TrackRef): boolean {
    return same(ref.codec, track.codec) && same(ref.language, track.language);
}

export function embeddedTracks(tracks: readonly MpvTrack[], type: MpvTrackType): MpvTrack[] {
    return tracks
        .filter(track => track.type === type && !track.external)
        .sort((a, b) => (a.ffIndex ?? a.id) - (b.ffIndex ?? b.id));
}

export function trackFor(tracks: readonly MpvTrack[], type: MpvTrackType, ref: TrackRef): MpvTrack | null {
    const embedded = embeddedTracks(tracks, type);
    const atPosition = embedded[ref.position] ?? null;
    if (atPosition && fits(atPosition, ref)) return atPosition;
    const matching = embedded.find(track => fits(track, ref) && (ref.codec !== null || ref.language !== null));
    return matching ?? atPosition;
}

export function selectedTrack(tracks: readonly MpvTrack[], type: MpvTrackType): MpvTrack | null {
    return tracks.find(track => track.type === type && track.selected) ?? null;
}

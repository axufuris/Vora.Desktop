import { describe, expect, it } from 'vitest';
import { embeddedTracks, selectedTrack, trackFor, tracksFrom } from './mpvTracks';

const list = tracksFrom([
    { id: 1, type: 'video', 'ff-index': 0, codec: 'hevc', selected: true },
    { id: 1, type: 'audio', 'ff-index': 1, codec: 'truehd', lang: 'eng', selected: true },
    { id: 2, type: 'audio', 'ff-index': 2, codec: 'ac3', lang: 'eng' },
    { id: 3, type: 'audio', 'ff-index': 3, codec: 'eac3', lang: 'fra' },
    { id: 1, type: 'sub', 'ff-index': 4, codec: 'hdmv_pgs_subtitle', lang: 'eng' },
    { id: 2, type: 'sub', 'ff-index': 5, codec: 'subrip', lang: 'spa' },
    { id: 3, type: 'sub', external: true, codec: 'webvtt', title: 'English' },
    { id: 9, type: 'unknown' },
]);

describe('mpv tracks', () => {
    it('reads the track list and leaves out what it does not know', () => {
        expect(list).toHaveLength(7);
        expect(selectedTrack(list, 'audio')?.codec).toBe('truehd');
    });

    it('counts only the file\'s own tracks, in file order', () => {
        expect(embeddedTracks(list, 'sub').map(track => track.id)).toEqual([1, 2]);
    });

    it('picks the track at the position the server chose when its codec and language agree', () => {
        expect(trackFor(list, 'audio', { position: 2, codec: 'EAC3', language: 'fra' })?.id).toBe(3);
        expect(trackFor(list, 'sub', { position: 1, codec: 'subrip', language: null })?.id).toBe(2);
    });

    it('looks for the codec and language when the position points at another track', () => {
        expect(trackFor(list, 'audio', { position: 0, codec: 'ac3', language: 'eng' })?.id).toBe(2);
    });

    it('trusts the position when nothing else fits, and finds nothing past the end', () => {
        expect(trackFor(list, 'audio', { position: 1, codec: 'dts', language: 'deu' })?.id).toBe(2);
        expect(trackFor(list, 'sub', { position: 5, codec: null, language: null })).toBeNull();
    });
});

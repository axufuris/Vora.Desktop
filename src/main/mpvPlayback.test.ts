import { describe, expect, it } from 'vitest';
import type { PlayerEvent } from '../shared/bridge';
import { MpvPlayback, TIME_INTERVAL_MS } from './mpvPlayback';
import type { JsonValue } from './values';

function playback() {
    const events: PlayerEvent[] = [];
    let now = 1000;
    const subject = new MpvPlayback(event => events.push(event), () => now);
    return { subject, events, advance: (ms: number) => { now += ms; } };
}

const property = (name: string, data: JsonValue) => ({ event: 'property-change', id: 1, name, data });

describe('turning mpv into player events', () => {
    it('reports the position at most four times a second, and at once when the length is known', () => {
        const { subject, events, advance } = playback();
        subject.startLoad(120);

        subject.handle(property('duration', 2700));
        subject.handle(property('time-pos', 120.1));
        advance(100);
        subject.handle(property('time-pos', 120.2));
        advance(TIME_INTERVAL_MS);
        subject.handle(property('time-pos', 120.5));

        expect(events).toEqual([
            { type: 'time', position: 120, duration: 2700 },
            { type: 'time', position: 120.5, duration: 2700 },
        ]);
    });

    it('reports pausing, buffering and loading', () => {
        const { subject, events } = playback();

        subject.handle({ event: 'file-loaded' });
        subject.handle(property('pause', true));
        subject.handle(property('paused-for-cache', true));

        expect(events).toEqual([{ type: 'loaded' }, { type: 'paused', paused: true }, { type: 'buffering', buffering: true }]);
        expect(subject.isLoaded).toBe(true);
    });

    it('reports the end of the video once, and not for a file that never loaded', () => {
        const { subject, events } = playback();
        subject.handle(property('eof-reached', true));
        subject.handle({ event: 'file-loaded' });
        subject.handle(property('eof-reached', true));
        subject.handle(property('eof-reached', true));

        expect(events.filter(event => event.type === 'ended')).toHaveLength(1);

        subject.startLoad(0);
        subject.handle({ event: 'file-loaded' });
        subject.handle(property('eof-reached', true));
        expect(events.filter(event => event.type === 'ended')).toHaveLength(2);
    });

    it('reports a file mpv could not play, and ignores one that was replaced', () => {
        const { subject, events } = playback();

        subject.handle({ event: 'end-file', reason: 'stop' });
        subject.handle({ event: 'end-file', reason: 'error', file_error: 'loading failed' });

        expect(events).toEqual([{ type: 'error', message: 'mpv could not play the video: loading failed.' }]);
    });

    it('describes what is playing for Playback info, only when it changes', () => {
        const { subject, events } = playback();

        subject.handle(property('track-list', [
            { id: 1, type: 'video', codec: 'hevc', selected: true },
            { id: 1, type: 'audio', codec: 'truehd', selected: true },
        ]));
        subject.handle(property('video-params', { w: 3840, h: 1600, gamma: 'pq' }));
        subject.handle(property('video-out-params', { gamma: 'pq' }));
        subject.handle(property('audio-params', { 'channel-count': 8 }));
        subject.handle(property('hwdec-current', 'd3d11va'));
        subject.handle(property('hwdec-current', 'd3d11va'));

        const info = events.filter(event => event.type === 'info');
        expect(info.at(-1)).toEqual({
            type: 'info',
            info: { videoCodec: 'hevc', width: 3840, height: 1600, outputTransfer: 'pq', hardwareDecoder: 'd3d11va', audioCodec: 'truehd', audioChannels: 8 },
        });
        expect(info).toHaveLength(5);
    });

    it('passes on what the player chrome asks for, and nothing malformed', () => {
        const { subject, events } = playback();

        subject.handle({ event: 'client-message', args: ['vora-intent', '{"type":"skip-marker"}'] });
        subject.handle({ event: 'client-message', args: ['vora-intent', '{"type":"seek","to":-5}'] });
        subject.handle({ event: 'client-message', args: ['vora-intent', 'not json'] });
        subject.handle({ event: 'client-message', args: ['something-else', '{"type":"exit"}'] });

        expect(events).toEqual([{ type: 'intent', intent: { type: 'skip-marker' } }]);
    });
});

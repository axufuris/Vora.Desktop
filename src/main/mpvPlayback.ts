import type { PlayerEvent, PlayerOutputInfo } from '../shared/bridge';
import type { MpvMessage } from './mpvIpc';
import { selectedTrack, tracksFrom, type MpvTrack } from './mpvTracks';
import { chromeIntentFrom } from './playerRequests';
import type { IpcValue, JsonValue } from './values';
import { isRecord } from './values';

export const OBSERVED_PROPERTIES = [
    'time-pos',
    'duration',
    'pause',
    'paused-for-cache',
    'eof-reached',
    'track-list',
    'video-params',
    'video-out-params',
    'audio-params',
    'hwdec-current',
] as const;

export const TIME_INTERVAL_MS = 250;

function numberOf(value: IpcValue): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function textOf(value: IpcValue): string | null {
    return typeof value === 'string' && value.length > 0 ? value : null;
}

function field(record: JsonValue | null, name: string): IpcValue {
    return record !== null && isRecord(record) ? record[name] : undefined;
}

export function errorMessage(fileError: IpcValue): string {
    const detail = textOf(fileError);
    return detail ? `mpv could not play the video: ${detail}.` : 'mpv could not play the video.';
}

export class MpvPlayback {
    private readonly emit: (event: PlayerEvent) => void;
    private readonly now: () => number;
    private position = 0;
    private duration = 0;
    private lastTimeSent = Number.NEGATIVE_INFINITY;
    private loaded = false;
    private ended = false;
    private trackList: MpvTrack[] = [];
    private videoParams: JsonValue | null = null;
    private videoOutParams: JsonValue | null = null;
    private audioParams: JsonValue | null = null;
    private hardwareDecoder: string | null = null;
    private lastInfo = '';

    constructor(emit: (event: PlayerEvent) => void, now: () => number = Date.now) {
        this.emit = emit;
        this.now = now;
    }

    get tracks(): readonly MpvTrack[] {
        return this.trackList;
    }

    get isLoaded(): boolean {
        return this.loaded;
    }

    startLoad(startSeconds: number): void {
        this.loaded = false;
        this.ended = false;
        this.position = startSeconds;
        this.duration = 0;
        this.lastTimeSent = Number.NEGATIVE_INFINITY;
    }

    handle(message: MpvMessage): void {
        switch (message.event) {
            case 'property-change':
                this.propertyChanged(textOf(message.name), message.data ?? null);
                return;
            case 'file-loaded':
                this.loaded = true;
                this.emit({ type: 'loaded' });
                return;
            case 'end-file':
                if (message.reason === 'error') this.emit({ type: 'error', message: errorMessage(message.file_error) });
                return;
            case 'client-message':
                this.clientMessage(message.args);
                return;
        }
    }

    private propertyChanged(name: string | null, data: JsonValue): void {
        switch (name) {
            case 'time-pos': {
                const position = numberOf(data);
                if (position === null) return;
                this.position = position;
                if (this.now() - this.lastTimeSent >= TIME_INTERVAL_MS) this.sendTime();
                return;
            }
            case 'duration': {
                const duration = numberOf(data);
                if (duration === null) return;
                this.duration = duration;
                this.sendTime();
                return;
            }
            case 'pause':
                if (typeof data === 'boolean') this.emit({ type: 'paused', paused: data });
                return;
            case 'paused-for-cache':
                if (typeof data === 'boolean') this.emit({ type: 'buffering', buffering: data });
                return;
            case 'eof-reached':
                if (data === true && this.loaded && !this.ended) {
                    this.ended = true;
                    this.emit({ type: 'ended' });
                }
                return;
            case 'track-list':
                this.trackList = tracksFrom(data);
                this.sendInfo();
                return;
            case 'video-params':
                this.videoParams = data;
                this.sendInfo();
                return;
            case 'video-out-params':
                this.videoOutParams = data;
                this.sendInfo();
                return;
            case 'audio-params':
                this.audioParams = data;
                this.sendInfo();
                return;
            case 'hwdec-current': {
                const decoder = textOf(data);
                this.hardwareDecoder = decoder && decoder !== 'no' ? decoder : null;
                this.sendInfo();
                return;
            }
        }
    }

    private sendTime(): void {
        this.lastTimeSent = this.now();
        this.emit({ type: 'time', position: this.position, duration: this.duration });
    }

    private sendInfo(): void {
        const info: PlayerOutputInfo = {
            videoCodec: selectedTrack(this.trackList, 'video')?.codec ?? null,
            width: numberOf(field(this.videoParams, 'w')),
            height: numberOf(field(this.videoParams, 'h')),
            outputTransfer: textOf(field(this.videoOutParams, 'gamma')),
            hardwareDecoder: this.hardwareDecoder,
            audioCodec: selectedTrack(this.trackList, 'audio')?.codec ?? null,
            audioChannels: numberOf(field(this.audioParams, 'channel-count')),
        };
        const key = JSON.stringify(info);
        if (key === this.lastInfo) return;
        this.lastInfo = key;
        this.emit({ type: 'info', info });
    }

    private clientMessage(args: JsonValue | undefined): void {
        if (!Array.isArray(args) || args[0] !== 'vora-intent' || typeof args[1] !== 'string') return;
        let parsed: JsonValue;
        try {
            parsed = JSON.parse(args[1]);
        } catch {
            return;
        }
        const intent = chromeIntentFrom(parsed);
        if (intent) this.emit({ type: 'intent', intent });
    }
}

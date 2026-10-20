import { execFileSync } from 'node:child_process';
import { createReadStream, mkdtempSync, statSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DesktopPlatform, PlayerEvent } from '../shared/bridge';
import { DefaultSettings } from './desktopSettings';
import { ipcPathFor } from './mpvConfig';
import { discoverMpv, readOsRelease, type MpvDiscovery } from './mpvDiscovery';
import { MpvHost, STOPPED_UNEXPECTEDLY } from './mpvHost';
import { MpvIpc } from './mpvIpc';
import type { JsonValue } from './values';

const platform: DesktopPlatform = process.platform === 'win32' ? 'windows' : 'linux';
const ffmpeg = process.env.VORA_TEST_FFMPEG ?? 'ffmpeg';
const work = mkdtempSync(join(tmpdir(), 'vora-mpv-test-'));

function hasFfmpeg(): boolean {
    try {
        execFileSync(ffmpeg, ['-version'], { stdio: 'ignore' });
        return true;
    } catch {
        return false;
    }
}

const mpv: MpvDiscovery = await discoverMpv({
    platform,
    bundledFolder: process.env.VORA_TEST_MPV_FOLDER ?? join(process.cwd(), 'resources', 'mpv'),
    pathVariable: process.env.PATH,
    probeFolder: join(work, 'probe'),
    osRelease: readOsRelease(platform),
});
const ready = mpv.binary !== null && hasFfmpeg();
const required = process.env.VORA_REQUIRE_MPV === '1';

const SRT = (text: string) => `1\n00:00:00,000 --> 00:00:08,000\n${text}\n`;
const VTT = 'WEBVTT\n\n00:00:00.000 --> 00:00:08.000\nFrom the server\n';

function makeFixture(): string {
    writeFileSync(join(work, 'en.srt'), SRT('English'), 'utf8');
    writeFileSync(join(work, 'de.srt'), SRT('Deutsch'), 'utf8');
    const file = join(work, 'fixture.mkv');
    execFileSync(ffmpeg, [
        '-y', '-hide_banner', '-loglevel', 'error',
        '-f', 'lavfi', '-i', 'testsrc2=size=320x240:rate=24:duration=8',
        '-f', 'lavfi', '-i', 'sine=frequency=440:duration=8',
        '-f', 'lavfi', '-i', 'sine=frequency=880:duration=8',
        '-i', join(work, 'en.srt'), '-i', join(work, 'de.srt'),
        '-map', '0:v', '-map', '1:a', '-map', '2:a', '-map', '3', '-map', '4',
        '-c:v', 'mpeg4', '-q:v', '5', '-c:a:0', 'aac', '-c:a:1', 'ac3', '-c:s', 'srt',
        '-metadata:s:a:0', 'language=eng', '-metadata:s:a:1', 'language=fra',
        '-metadata:s:s:0', 'language=eng', '-metadata:s:s:1', 'language=ger',
        file,
    ], { stdio: 'ignore' });
    return file;
}

function serve(file: string): Promise<Server> {
    const server = createServer((request, response) => {
        if (request.url !== '/api/streaming/play/fixture.mkv') {
            response.writeHead(404);
            response.end();
            return;
        }
        const size = statSync(file).size;
        const range = /bytes=(\d+)-(\d*)/.exec(request.headers.range ?? '');
        const start = range ? Number(range[1]) : 0;
        const end = range && range[2] ? Number(range[2]) : size - 1;
        response.writeHead(range ? 206 : 200, {
            'Accept-Ranges': 'bytes',
            'Content-Type': 'video/x-matroska',
            'Content-Length': end - start + 1,
            ...(range ? { 'Content-Range': `bytes ${start}-${end}/${size}` } : {}),
        });
        createReadStream(file, { start, end }).pipe(response);
    });
    return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

class Harness {
    readonly events: PlayerEvent[] = [];
    hidden = 0;
    restored = 0;
    readonly folders = { runtime: join(work, 'runtime'), temp: join(work, 'temp'), logs: join(work, 'logs'), sockets: tmpdir() };
    readonly host = new MpvHost({
        platform,
        folders: this.folders,
        discovery: () => mpv,
        settings: () => DefaultSettings,
        advancedConf: () => {
            const conf = join(work, 'user-mpv.conf');
            writeFileSync(conf, '', 'utf8');
            return conf;
        },
        verifyTls: () => true,
        window: { hide: () => { this.hidden++; }, restore: () => { this.restored++; } },
        send: event => { this.events.push(event); },
        logger: { info: () => undefined, warn: () => undefined },
        extraArguments: ['--vo=null', '--ao=null', '--fullscreen=no', '--force-window=no'],
    });

    async until<T extends PlayerEvent>(test: (event: PlayerEvent) => event is T, from = 0, timeoutMs = 15_000): Promise<T> {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            const found = this.events.slice(from).find(test);
            if (found) return found;
            await new Promise(resolve => setTimeout(resolve, 25));
        }
        throw new Error(`Timed out; events so far: ${JSON.stringify(this.events.slice(from).filter(event => event.type !== 'time'))}`);
    }

    probe(run: number): Promise<MpvIpc> {
        return MpvIpc.connect(ipcPathFor(platform, process.pid, run, this.folders.sockets), Date.now() + 5000, () => true);
    }
}

const is = <K extends PlayerEvent['type']>(type: K) => (event: PlayerEvent): event is Extract<PlayerEvent, { type: K }> => event.type === type;

async function property(ipc: MpvIpc, name: string): Promise<JsonValue> {
    return ipc.command(['get_property', name]);
}

async function settle(check: () => Promise<boolean>, timeoutMs = 10_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (await check()) return;
        await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error('The player never got there');
}

describe.skipIf(!ready && !required)('the Vora player with a real mpv', () => {
    let server: Server;
    let url: string;

    beforeAll(async () => {
        if (!ready) throw new Error(`These tests need mpv ${mpv.status.reason ?? ''} and ffmpeg (${ffmpeg}).`);
        server = await serve(makeFixture());
        url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/streaming/play/fixture.mkv`;
    }, 60_000);

    afterAll(() => {
        server?.close();
    });

    it('plays from the resume point with the tracks the server chose, switches and adds tracks, seeks, ends, plays the next video and closes', async () => {
        const harness = new Harness();
        const { host } = harness;

        await host.open({ url, startSeconds: 2, title: 'Fixture', audioTrack: { position: 1, codec: 'AC3', language: 'fra' }, subtitleTrack: { position: 1, codec: 'subrip', language: 'ger' } });
        await harness.until(is('loaded'));
        const firstTime = await harness.until((event): event is Extract<PlayerEvent, { type: 'time' }> => event.type === 'time' && event.duration > 0);
        expect(firstTime.position).toBeGreaterThanOrEqual(1.9);
        expect(firstTime.position).toBeLessThan(4);
        expect(firstTime.duration).toBeCloseTo(8, 0);
        expect(harness.hidden).toBeGreaterThan(0);

        const probe = await harness.probe(1);
        await settle(async () => await property(probe, 'aid') === 2 && await property(probe, 'sid') === 2);
        await harness.until((event): event is Extract<PlayerEvent, { type: 'info' }> => event.type === 'info' && event.info.audioCodec === 'ac3');

        host.command({ type: 'tracks', audioTrack: { position: 0, codec: 'aac', language: 'eng' }, subtitleTrack: null });
        await settle(async () => await property(probe, 'aid') === 1 && await property(probe, 'sid') === false);

        host.command({ type: 'sub-add', subtitle: { title: 'English (Vora)', vtt: VTT } });
        await settle(async () => await property(probe, 'sid') === 3);

        host.command({ type: 'pause' });
        await harness.until((event): event is Extract<PlayerEvent, { type: 'paused' }> => event.type === 'paused' && event.paused);
        host.command({ type: 'play' });
        const beforeSeek = harness.events.length;
        host.command({ type: 'seek', seconds: 7.5 });
        await harness.until(is('ended'), beforeSeek);

        const beforeNext = harness.events.length;
        host.command({ type: 'load-next', request: { url, startSeconds: 0, title: 'Next', audioTrack: null, subtitleTrack: null } });
        await harness.until(is('loaded'), beforeNext);
        await settle(async () => await property(probe, 'sid') === false && await property(probe, 'media-title') === 'Next');

        const beforeClose = harness.events.length;
        await host.close();
        await harness.until(is('closed'), beforeClose);
        expect(harness.events.slice(beforeClose).some(is('error'))).toBe(false);
        expect(harness.restored).toBe(1);
        expect(host.isPlaying).toBe(false);
        probe.close();
    }, 60_000);

    it('reports a video the server could not send', async () => {
        const harness = new Harness();

        await harness.host.open({ url: url.replace('fixture.mkv', 'missing.mkv'), startSeconds: 0, title: 'Missing', audioTrack: null, subtitleTrack: null });
        const error = await harness.until(is('error'));

        expect(error.message).toContain('mpv could not play the video');
        await harness.host.close();
    }, 30_000);

    it('brings the window back and explains when mpv dies mid-video', async () => {
        const harness = new Harness();
        await harness.host.open({ url, startSeconds: 0, title: 'Fixture', audioTrack: null, subtitleTrack: null });
        await harness.until(is('loaded'));
        const probe = await harness.probe(1);
        const pid = await property(probe, 'pid');
        probe.close();

        process.kill(Number(pid));
        const error = await harness.until(is('error'));
        await harness.until(is('closed'));

        expect(error.message).toBe(STOPPED_UNEXPECTEDLY);
        expect(harness.restored).toBe(1);
        expect(harness.host.isPlaying).toBe(false);
    }, 30_000);
});

import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
    DesktopPlatform,
    DesktopSettings,
    MpvStatus,
    OpenRequest,
    PlayerCommand,
    PlayerEvent,
    SidecarSubtitle,
    TrackRef,
} from '../shared/bridge';
import { ipcPathFor, mpvLaunchArguments, runtimeMpvConf } from './mpvConfig';
import type { MpvDiscovery } from './mpvDiscovery';
import { MpvIpc, type MpvArgument } from './mpvIpc';
import { MpvPlayback, OBSERVED_PROPERTIES } from './mpvPlayback';
import { trackFor, tracksFrom, type MpvTrack } from './mpvTracks';
import type { Player } from './player';

const CONNECT_TIMEOUT_MS = 10_000;
const QUIT_TIMEOUT_MS = 3000;

export const STOPPED_BEFORE_START = 'The Vora player stopped before the video started. mpv.log in the Vora Desktop logs folder has the details.';
export const STOPPED_UNEXPECTEDLY = 'The Vora player stopped unexpectedly. mpv.log in the Vora Desktop logs folder has the details.';

export interface PlayerWindow {
    hide(): void;
    restore(): void;
}

export interface PlayerLog {
    info(message: string, detail?: string): void;
    warn(message: string, error?: unknown): void;
}

export interface MpvFolders {
    runtime: string;
    temp: string;
    logs: string;
    sockets: string;
}

export interface MpvHostOptions {
    platform: DesktopPlatform;
    folders: MpvFolders;
    discovery: () => MpvDiscovery;
    settings: () => DesktopSettings;
    advancedConf: () => string;
    verifyTls: (url: string) => boolean;
    window: PlayerWindow;
    send: (event: PlayerEvent) => void;
    logger: PlayerLog;
    extraArguments?: readonly string[];
    spawnProcess?: (file: string, args: readonly string[]) => ChildProcess;
}

type TrackChange = { audioTrack?: TrackRef; subtitleTrack?: TrackRef | null };

type Waiting = { kind: 'tracks'; change: TrackChange } | { kind: 'subtitle'; subtitle: SidecarSubtitle };

interface MpvRun {
    process: ChildProcess;
    ipc: MpvIpc | null;
    playback: MpvPlayback;
    closing: boolean;
    exited: boolean;
    exitCode: number | null;
    waitForExit: Promise<void>;
    wanted: TrackChange;
    waiting: Waiting[];
    subtitleFiles: string[];
    hidWindow: boolean;
}

function seconds(value: number): string {
    return value.toFixed(3);
}

export class MpvHost implements Player {
    private readonly options: MpvHostOptions;
    private run: MpvRun | null = null;
    private runs = 0;
    private subtitles = 0;

    constructor(options: MpvHostOptions) {
        this.options = options;
    }

    status(): MpvStatus {
        return this.options.discovery().status;
    }

    get isPlaying(): boolean {
        return this.run !== null;
    }

    async open(request: OpenRequest): Promise<void> {
        const current = this.run;
        if (current?.ipc && !current.exited) {
            await this.load(current, request);
            return;
        }
        const run = await this.start(request.url);
        await this.load(run, request);
    }

    command(command: PlayerCommand): void {
        const run = this.run;
        if (!run?.ipc) return;
        switch (command.type) {
            case 'play':
            case 'pause':
                run.ipc.send(['set_property', 'pause', command.type === 'pause']);
                return;
            case 'seek':
                run.ipc.send(['seek', seconds(command.seconds), 'absolute+exact']);
                return;
            case 'tracks': {
                const change: TrackChange = {};
                if (command.audioTrack !== undefined) change.audioTrack = command.audioTrack;
                if (command.subtitleTrack !== undefined) change.subtitleTrack = command.subtitleTrack;
                if (run.playback.isLoaded) void this.applyTracks(run, change);
                else run.waiting.push({ kind: 'tracks', change });
                return;
            }
            case 'sub-add':
                if (run.playback.isLoaded) void this.addSubtitle(run, command.subtitle);
                else run.waiting.push({ kind: 'subtitle', subtitle: command.subtitle });
                return;
            case 'load-next':
                this.open(command.request).catch((error: unknown) => {
                    this.options.logger.warn('Could not load the next video', error);
                    this.options.send({ type: 'error', message: error instanceof Error ? error.message : STOPPED_UNEXPECTEDLY });
                });
                return;
        }
    }

    async close(): Promise<void> {
        const run = this.run;
        if (!run) return;
        this.run = null;
        run.closing = true;
        run.ipc?.send(['quit']);
        const quit = await Promise.race([
            run.waitForExit.then(() => true),
            new Promise<boolean>(resolve => setTimeout(() => resolve(false), QUIT_TIMEOUT_MS)),
        ]);
        if (!quit) {
            this.options.logger.warn('mpv did not quit in time, so it was stopped');
            run.process.kill();
            await run.waitForExit;
        }
    }

    dispose(): void {
        const run = this.run;
        this.run = null;
        if (!run) return;
        run.closing = true;
        run.process.kill();
    }

    private async start(url: string): Promise<MpvRun> {
        const { options } = this;
        const binary = options.discovery().binary;
        if (!binary) throw new Error(options.discovery().status.reason ?? 'The Vora player is not available on this computer.');

        const { folders } = options;
        for (const folder of [folders.runtime, folders.temp, folders.logs, folders.sockets]) mkdirSync(folder, { recursive: true });
        writeFileSync(join(folders.runtime, 'mpv.conf'), runtimeMpvConf({
            platform: options.platform,
            settings: options.settings(),
            advancedConf: options.advancedConf(),
        }), 'utf8');

        const ipcPath = ipcPathFor(options.platform, process.pid, ++this.runs, folders.sockets);
        if (options.platform !== 'windows') rmSync(ipcPath, { force: true });
        const args = mpvLaunchArguments({
            configFolder: folders.runtime,
            ipcPath,
            logFile: join(folders.logs, 'mpv.log'),
            verifyTls: options.verifyTls(url),
            extraArguments: options.extraArguments,
        });

        options.logger.info(`Starting mpv ${binary.version.label}`, binary.path);
        const child = (options.spawnProcess ?? ((file, list) => spawn(file, [...list], { stdio: 'ignore', windowsHide: false })))(binary.path, args);

        let markExited: () => void = () => undefined;
        const run: MpvRun = {
            process: child,
            ipc: null,
            playback: new MpvPlayback(event => { if (this.run === run) options.send(event); }),
            closing: false,
            exited: false,
            exitCode: null,
            waitForExit: new Promise(resolve => { markExited = resolve; }),
            wanted: {},
            waiting: [],
            subtitleFiles: [],
            hidWindow: false,
        };
        this.run = run;

        child.once('error', error => {
            options.logger.warn('mpv could not be started', error);
            this.exited(run, null);
            markExited();
        });
        child.once('exit', code => {
            this.exited(run, code);
            markExited();
        });

        try {
            const ipc = await MpvIpc.connect(ipcPath, Date.now() + CONNECT_TIMEOUT_MS, () => !run.exited);
            run.ipc = ipc;
            ipc.onMessage(message => {
                run.playback.handle(message);
                if (message.event === 'file-loaded') void this.fileLoaded(run);
            });
            for (const [index, name] of OBSERVED_PROPERTIES.entries()) ipc.send(['observe_property', index + 1, name]);
            return run;
        } catch (error: unknown) {
            if (this.run === run) this.run = null;
            run.closing = true;
            child.kill();
            throw error instanceof Error ? error : new Error(STOPPED_BEFORE_START);
        }
    }

    private async load(run: MpvRun, request: OpenRequest): Promise<void> {
        const ipc = run.ipc;
        if (!ipc) throw new Error(STOPPED_BEFORE_START);
        run.wanted = { audioTrack: request.audioTrack ?? undefined, subtitleTrack: request.subtitleTrack };
        run.waiting = [];
        run.playback.startLoad(request.startSeconds);
        await ipc.command(['set_property', 'force-media-title', request.title]);
        await ipc.command(['set_property', 'start', seconds(request.startSeconds)]);
        await ipc.command(['loadfile', request.url, 'replace']);
    }

    private async fileLoaded(run: MpvRun): Promise<void> {
        if (this.run !== run) return;
        if (!run.hidWindow) {
            run.hidWindow = true;
            this.options.logger.info('Playing in mpv, so the app window is hidden');
            this.options.window.hide();
        }
        await this.applyTracks(run, run.wanted);
        const waiting = run.waiting;
        run.waiting = [];
        for (const item of waiting) {
            if (item.kind === 'tracks') await this.applyTracks(run, item.change);
            else await this.addSubtitle(run, item.subtitle);
        }
    }

    private async currentTracks(run: MpvRun): Promise<readonly MpvTrack[]> {
        if (!run.ipc) return [];
        try {
            return tracksFrom(await run.ipc.command(['get_property', 'track-list']));
        } catch {
            return run.playback.tracks;
        }
    }

    private async applyTracks(run: MpvRun, change: TrackChange): Promise<void> {
        const ipc = run.ipc;
        if (!ipc || (change.audioTrack === undefined && change.subtitleTrack === undefined)) return;
        const tracks = await this.currentTracks(run);
        const commands: MpvArgument[][] = [];
        if (change.audioTrack) {
            const audio = trackFor(tracks, 'audio', change.audioTrack);
            if (audio) commands.push(['set_property', 'aid', audio.id]);
            else this.options.logger.warn(`The file has no audio track at position ${change.audioTrack.position}`);
        }
        if (change.subtitleTrack === null) {
            commands.push(['set_property', 'sid', 'no']);
        } else if (change.subtitleTrack) {
            const subtitle = trackFor(tracks, 'sub', change.subtitleTrack);
            if (subtitle) commands.push(['set_property', 'sid', subtitle.id]);
            else this.options.logger.warn(`The file has no subtitle track at position ${change.subtitleTrack.position}`);
        }
        for (const command of commands) {
            try {
                await ipc.command(command);
            } catch (error: unknown) {
                this.options.logger.warn('mpv did not switch tracks', error);
            }
        }
    }

    private async addSubtitle(run: MpvRun, subtitle: SidecarSubtitle): Promise<void> {
        const ipc = run.ipc;
        if (!ipc) return;
        const file = join(this.options.folders.temp, `subtitle-${process.pid}-${++this.subtitles}.vtt`);
        try {
            writeFileSync(file, subtitle.vtt, 'utf8');
            run.subtitleFiles.push(file);
            await ipc.command(['sub-add', file, 'select', subtitle.title]);
        } catch (error: unknown) {
            this.options.logger.warn('mpv did not take the subtitle', error);
        }
    }

    private exited(run: MpvRun, code: number | null): void {
        if (run.exited) return;
        run.exited = true;
        run.exitCode = code;
        run.ipc?.close();
        for (const file of run.subtitleFiles) rmSync(file, { force: true });
        this.options.logger.info(`mpv exited${code === null ? '' : ` with code ${code}`}`);

        const current = this.run === run;
        if (current) this.run = null;
        if (this.run) return;

        this.options.window.restore();
        this.options.logger.info('The app window is back');
        if (!run.closing && current) {
            if (!run.playback.isLoaded) this.options.send({ type: 'error', message: STOPPED_BEFORE_START });
            else if (code !== 0) this.options.send({ type: 'error', message: STOPPED_UNEXPECTEDLY });
        }
        if (current || run.closing) this.options.send({ type: 'closed' });
    }
}

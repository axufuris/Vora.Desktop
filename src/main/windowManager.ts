import { join } from 'node:path';
import { BrowserWindow, screen, shell, type Event, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron';
import type { LoadFailure, SavedServer } from '../shared/shell';
import type { CertTrust } from './certTrust';
import { readJson, writeJson } from './jsonFile';
import { ERR_ABORTED, failureQuery, friendlyMessage, isCertificateError } from './loadFailure';
import type { FileLogger } from './logger';
import { isServerPage, navigationVerdict, pageAccess, popupVerdict, type PageAccess, type PageLocations } from './navigation';
import { hostOf, originOf } from './serverProbe';
import type { ServerStore } from './serverStore';
import { isOnScreen, MIN_HEIGHT, MIN_WIDTH, windowStateFrom, type WindowState } from './windowState';

export type ShellPage = 'connect' | 'error';

export interface WindowManagerOptions {
    title: string;
    icon: string;
    preload: string;
    userData: string;
    pages: PageLocations;
    devRendererUrl: string | null;
    rendererFolder: string;
    devTools: boolean;
    servers: ServerStore;
    trust: CertTrust;
    logger: FileLogger;
}

export class WindowManager {
    private readonly options: WindowManagerOptions;
    private readonly statePath: string;
    private window: BrowserWindow | null = null;
    private server: SavedServer | null = null;
    private pendingHost: string | null = null;

    constructor(options: WindowManagerOptions) {
        this.options = options;
        this.statePath = join(options.userData, 'windowState.json');
    }

    create(): BrowserWindow {
        const saved = readJson(this.statePath, windowStateFrom, null);
        const workAreas = screen.getAllDisplays().map(display => display.workArea);
        const placed = saved && isOnScreen(saved, workAreas) ? saved : null;

        const window = new BrowserWindow({
            title: this.options.title,
            icon: this.options.icon,
            show: false,
            autoHideMenuBar: true,
            minWidth: MIN_WIDTH,
            minHeight: MIN_HEIGHT,
            backgroundColor: '#08080b',
            ...(placed ? { x: placed.x, y: placed.y, width: placed.width, height: placed.height } : { width: 1600, height: 900 }),
            webPreferences: {
                preload: this.options.preload,
                contextIsolation: true,
                sandbox: true,
                nodeIntegration: false,
                nodeIntegrationInSubFrames: false,
                webviewTag: false,
                backgroundThrottling: false,
                spellcheck: false,
                devTools: this.options.devTools,
            },
        });
        this.window = window;

        window.once('ready-to-show', () => {
            if (!placed || placed.maximized) window.maximize();
            window.show();
        });
        window.on('close', () => this.saveState(window));
        window.on('closed', () => { this.window = null; });
        window.on('page-title-updated', event => event.preventDefault());

        this.guard(window);
        return window;
    }

    focus(): void {
        const window = this.window;
        if (!window) return;
        if (window.isMinimized()) window.restore();
        window.show();
        window.focus();
    }

    get browserWindow(): BrowserWindow | null {
        return this.window;
    }

    get currentServer(): SavedServer | null {
        return this.server;
    }

    serverOrigin(): string | null {
        return this.server ? originOf(this.server.url) : null;
    }

    serverHosts(): Set<string> {
        const hosts = new Set(this.options.servers.servers().map(server => hostOf(server.url).toLowerCase()));
        if (this.server) hosts.add(hostOf(this.server.url).toLowerCase());
        if (this.pendingHost) hosts.add(this.pendingHost.toLowerCase());
        return hosts;
    }

    setPendingHost(host: string | null): void {
        this.pendingHost = host;
    }

    accessOf(event: IpcMainEvent | IpcMainInvokeEvent): PageAccess {
        const frame = event.senderFrame;
        if (!this.window || event.sender !== this.window.webContents || !frame || frame.parent !== null) return 'none';
        return pageAccess(frame.url, this.serverOrigin(), this.options.pages);
    }

    showServer(server: SavedServer): void {
        const window = this.window;
        if (!window) return;
        this.server = server;
        this.options.logger.info('Loading the server', server.url);
        void window.loadURL(`${server.url}/`).catch(() => undefined);
    }

    showConnect(): void {
        this.server = null;
        this.showPage('connect', {});
    }

    showFailure(failure: LoadFailure): void {
        const name = this.server?.name ?? failure.url;
        this.showPage('error', failureQuery(failure, name));
    }

    retry(): void {
        if (this.server) this.showServer(this.server);
        else this.showConnect();
    }

    reload(): void {
        const contents = this.window?.webContents;
        if (!contents) return;
        if (this.server && isServerPage(contents.getURL(), this.serverOrigin())) contents.reload();
        else this.retry();
    }

    toggleFullScreen(): void {
        const window = this.window;
        if (window) window.setFullScreen(!window.isFullScreen());
    }

    private showPage(page: ShellPage, query: Record<string, string>): void {
        const window = this.window;
        if (!window) return;
        const loading = this.options.devRendererUrl
            ? window.loadURL(`${this.options.devRendererUrl}/${page}.html?${new URLSearchParams(query).toString()}`)
            : window.loadFile(join(this.options.rendererFolder, `${page}.html`), { query });
        void loading.catch(() => undefined);
    }

    private guard(window: BrowserWindow): void {
        const contents = window.webContents;
        const onNavigate = (event: Event, url: string) => {
            const verdict = navigationVerdict(url, this.serverOrigin(), this.options.pages);
            if (verdict === 'allow') return;
            event.preventDefault();
            if (verdict === 'external') void shell.openExternal(url);
            else this.options.logger.warn('Blocked a navigation', url);
        };
        contents.on('will-navigate', onNavigate);
        contents.on('will-redirect', onNavigate);
        contents.on('will-attach-webview', event => event.preventDefault());
        contents.setWindowOpenHandler(({ url }) => {
            if (popupVerdict(url) === 'external') void shell.openExternal(url);
            else this.options.logger.warn('Blocked a new window', url);
            return { action: 'deny' };
        });
        contents.on('did-fail-load', (_event, errorCode, errorDescription, validatedUrl, isMainFrame) => {
            if (!isMainFrame || errorCode === ERR_ABORTED) return;
            const server = this.server;
            if (!server || !isServerPage(validatedUrl, this.serverOrigin())) return;
            this.options.logger.warn(`Could not load ${validatedUrl}`, `${errorCode} ${errorDescription}`);
            const host = hostOf(server.url);
            const fingerprint = isCertificateError(errorCode) ? this.options.trust.lastUntrusted(host) : null;
            this.showFailure(fingerprint
                ? { kind: 'untrusted', url: server.url, host, fingerprint, changed: this.options.trust.pinnedFingerprint(host) !== null }
                : { kind: 'unreachable', url: server.url, message: friendlyMessage(errorCode, errorDescription) });
        });
        contents.on('render-process-gone', (_event, details) => {
            this.options.logger.error('The page stopped', details.reason);
            if (details.reason !== 'clean-exit') this.retry();
        });
    }

    private saveState(window: BrowserWindow): void {
        const bounds = window.getNormalBounds();
        const state: WindowState = { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height, maximized: window.isMaximized() };
        try {
            writeJson(this.statePath, { ...state });
        } catch (error: unknown) {
            this.options.logger.warn('Could not save the window position', error);
        }
    }
}

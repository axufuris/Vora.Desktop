import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { app, dialog, Menu, session, type BrowserWindow } from 'electron';
import type { DesktopChannel, DesktopPlatform } from '../shared/bridge';
import { registerBridge } from './bridgeRouter';
import { CertTrust, fingerprintOf } from './certTrust';
import { ConnectFlow } from './connectFlow';
import { DesktopSettingsStore } from './desktopSettings';
import { FileLogger } from './logger';
import { buildMenu } from './menu';
import { NoPlayer } from './player';
import { normaliseServerUrl } from './serverProbe';
import { ServerStore } from './serverStore';
import { WindowManager } from './windowManager';

const ALLOWED_PERMISSIONS = new Set(['fullscreen', 'clipboard-sanitized-write']);
const VERIFY_ACCEPT = 0;
const VERIFY_USE_CHROMIUM = -3;

const channel: DesktopChannel = __VORA_CHANNEL__;
const platform: DesktopPlatform = process.platform === 'win32' ? 'windows' : 'linux';
const devServerUrl = !app.isPackaged ? normaliseServerUrl(process.env.VORA_DESKTOP_DEV_URL ?? '') : null;
const devRendererUrl = !app.isPackaged ? process.env.ELECTRON_RENDERER_URL ?? null : null;

function showAbout(window: BrowserWindow | null): void {
    const options = {
        type: 'info' as const,
        title: 'About Vora Desktop',
        message: `Vora Desktop ${app.getVersion()}${channel === 'qa' ? ' (QA)' : ''}`,
        detail: [
            `Electron ${process.versions.electron}`,
            `Chromium ${process.versions.chrome}`,
            `Node.js ${process.versions.node}`,
            '',
            'Licensed under the GNU AGPL-3.0.',
        ].join('\n'),
    };
    void (window ? dialog.showMessageBox(window, options) : dialog.showMessageBox(options));
}

function start(): void {
    const userData = app.getPath('userData');
    const logger = new FileLogger(join(userData, 'logs'), 'vora-desktop.log');
    logger.info(`Vora Desktop ${app.getVersion()} (${channel}) starting`, `Electron ${process.versions.electron} on ${process.platform}`);
    process.on('unhandledRejection', reason => logger.error('Unhandled rejection', reason));

    const servers = new ServerStore(join(userData, 'servers.json'));
    const trust = new CertTrust(join(userData, 'certTrust.json'));
    const settings = new DesktopSettingsStore(userData);
    const rendererFolder = join(__dirname, '../renderer');
    const devTools = !app.isPackaged || channel === 'qa';

    const window = new WindowManager({
        title: channel === 'qa' ? 'Vora QA' : 'Vora',
        icon: join(__dirname, '../../resources/icons/vora-512.png'),
        preload: join(__dirname, '../preload/index.js'),
        userData,
        pages: { devPagesOrigin: devRendererUrl ? new URL(devRendererUrl).origin : null, pagesFolderUrl: pathToFileURL(rendererFolder).href },
        devRendererUrl,
        rendererFolder,
        devTools,
        servers,
        trust,
        logger,
    });

    const checkedCertificate = (hostname: string, pem: string): boolean => {
        try {
            const fingerprint = fingerprintOf(pem);
            if (trust.verdict(hostname, fingerprint, window.serverHosts()) === 'accept') return true;
            logger.warn(`Refused the certificate of ${hostname}`, fingerprint);
        } catch (error: unknown) {
            logger.error(`Could not check the certificate of ${hostname}`, error);
        }
        return false;
    };

    app.on('certificate-error', (event, _contents, url, _error, certificate, callback) => {
        let hostname: string;
        try {
            hostname = new URL(url).hostname;
        } catch {
            callback(false);
            return;
        }
        if (!checkedCertificate(hostname, certificate.data)) {
            callback(false);
            return;
        }
        event.preventDefault();
        callback(true);
    });

    let probeGeneration = 0;
    const probeSession = () => {
        const probe = session.fromPartition(`vora-probe-${probeGeneration++}`);
        probe.setCertificateVerifyProc((request, callback) => {
            if (request.errorCode === 0) callback(VERIFY_USE_CHROMIUM);
            else callback(checkedCertificate(request.hostname, request.certificate.data) ? VERIFY_ACCEPT : VERIFY_USE_CHROMIUM);
        });
        probe.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
        return probe;
    };
    let probe = probeSession();

    const defaultSession = session.defaultSession;
    defaultSession.setPermissionRequestHandler((_contents, permission, callback) => callback(ALLOWED_PERMISSIONS.has(permission)));
    defaultSession.setPermissionCheckHandler((_contents, permission) => ALLOWED_PERMISSIONS.has(permission));

    const connect = new ConnectFlow({
        fetcher: (url, init) => probe.fetch(url, init),
        trust,
        servers,
        target: window,
        certificatesChanged: () => {
            probe = probeSession();
            return Promise.resolve();
        },
    });
    registerBridge({ shellVersion: app.getVersion(), channel, platform, window, servers, settings, connect, player: new NoPlayer(), logger });

    Menu.setApplicationMenu(buildMenu({
        switchServer: () => window.showConnect(),
        reload: () => window.reload(),
        toggleFullScreen: () => window.toggleFullScreen(),
        about: () => showAbout(window.browserWindow),
        devTools,
    }));

    window.create();
    const last = servers.last();
    if (devServerUrl) window.showServer({ id: 'dev', url: devServerUrl, name: 'Vora (development)', lastUsedAt: new Date().toISOString() });
    else if (last) window.showServer(last);
    else window.showConnect();

    app.on('second-instance', () => window.focus());
}

if (!app.requestSingleInstanceLock()) {
    app.quit();
} else {
    app.on('web-contents-created', (_event, contents) => {
        contents.on('will-attach-webview', event => event.preventDefault());
        contents.setWindowOpenHandler(() => ({ action: 'deny' }));
    });
    app.on('window-all-closed', () => app.quit());
    void app.whenReady().then(start);
}

import { ipcMain, screen, shell, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron';
import type { DesktopCapabilities, DesktopChannel, DesktopPlatform, DesktopSettings } from '../shared/bridge';
import { DESKTOP_BRIDGE_VERSION } from '../shared/bridge';
import { Ipc, type PageInit, type ProbeResult, type SavedServer } from '../shared/shell';
import { desktopCapabilities } from './capabilities';
import type { ConnectFlow } from './connectFlow';
import { settingsPatchFrom, type DesktopSettingsStore } from './desktopSettings';
import type { FileLogger } from './logger';
import type { MpvBinary } from './mpvDiscovery';
import type { PageAccess } from './navigation';
import type { Player } from './player';
import { openRequestFrom, playerCommandFrom, scrubSpriteFrom } from './playerRequests';
import type { ServerStore } from './serverStore';
import type { WindowManager } from './windowManager';
import type { IpcValue } from './values';

const MAX_ADDRESS = 2048;
const MAX_FINGERPRINT = 128;

export interface BridgeContext {
    shellVersion: string;
    channel: DesktopChannel;
    platform: DesktopPlatform;
    window: WindowManager;
    servers: ServerStore;
    settings: DesktopSettingsStore;
    connect: ConnectFlow;
    player: Player;
    mpv: () => MpvBinary | null;
    logger: FileLogger;
}

class NotAllowed extends Error {
    constructor() {
        super('This page may not use Vora Desktop.');
    }
}

function textArg(value: IpcValue, maxLength: number): string {
    if (typeof value !== 'string' || value.length > maxLength) throw new Error('The request was not understood.');
    return value;
}

export function registerBridge(context: BridgeContext): void {
    const { window, logger } = context;

    const requireAccess = (event: IpcMainEvent | IpcMainInvokeEvent, access: PageAccess): void => {
        if (window.accessOf(event) !== access) throw new NotAllowed();
    };

    const handle = <T>(channel: string, access: PageAccess, handler: (...args: IpcValue[]) => T | Promise<T>): void => {
        ipcMain.handle(channel, (event, ...args: IpcValue[]) => {
            requireAccess(event, access);
            return handler(...args);
        });
    };

    const listen = (channel: string, access: readonly PageAccess[], handler: (...args: IpcValue[]) => void): void => {
        ipcMain.on(channel, (event, ...args: IpcValue[]) => {
            if (!access.includes(window.accessOf(event))) {
                logger.warn('Ignored a message from a page that may not send it', channel);
                return;
            }
            handler(...args);
        });
    };

    ipcMain.on(Ipc.pageInit, event => {
        const access = window.accessOf(event);
        const init: PageInit = access === 'server'
            ? {
                kind: 'server',
                bridgeVersion: DESKTOP_BRIDGE_VERSION,
                shellVersion: context.shellVersion,
                channel: context.channel,
                platform: context.platform,
                mpv: context.player.status(),
            }
            : access === 'shell'
                ? { kind: 'shell', shellVersion: context.shellVersion, channel: context.channel }
                : { kind: 'none' };
        event.returnValue = init;
    });

    handle(Ipc.capabilities, 'server', (): DesktopCapabilities => {
        const browserWindow = window.browserWindow;
        const display = browserWindow ? screen.getDisplayMatching(browserWindow.getBounds()) : screen.getPrimaryDisplay();
        return desktopCapabilities({
            width: Math.round(display.size.width * display.scaleFactor),
            height: Math.round(display.size.height * display.scaleFactor),
        }, context.mpv());
    });

    handle(Ipc.settingsGet, 'server', (): DesktopSettings => context.settings.get());

    handle(Ipc.settingsSet, 'server', (patch): DesktopSettings => {
        const valid = settingsPatchFrom(patch);
        if (!valid) throw new Error('The settings change was not understood.');
        return context.settings.set(valid);
    });

    handle(Ipc.settingsOpenAdvanced, 'server', async (): Promise<void> => {
        const problem = await shell.openPath(context.settings.ensureAdvancedFolder());
        if (problem) throw new Error(problem);
    });

    handle(Ipc.playerOpen, 'server', (request): Promise<void> => {
        const valid = openRequestFrom(request, window.serverOrigin());
        if (!valid) throw new Error('The Vora player was asked to open something it may not.');
        return context.player.open(valid);
    });

    listen(Ipc.playerCommand, ['server'], command => {
        const valid = playerCommandFrom(command, window.serverOrigin());
        if (valid) context.player.command(valid);
        else logger.warn('Ignored a player command that was not understood');
    });

    listen(Ipc.playerChromeState, ['server'], () => undefined);

    handle(Ipc.playerScrubSprite, 'server', (spec): void => {
        if (scrubSpriteFrom(spec) === undefined) throw new Error('The scrub thumbnails were not understood.');
    });

    handle(Ipc.playerClose, 'server', (): Promise<void> => context.player.close());

    listen(Ipc.switchServer, ['server', 'shell'], () => window.showConnect());

    handle(Ipc.shellServers, 'shell', (): SavedServer[] => context.servers.servers());

    handle(Ipc.shellProbe, 'shell', (input): Promise<ProbeResult> => context.connect.probe(textArg(input, MAX_ADDRESS)));

    handle(Ipc.shellTrust, 'shell', (url, fingerprint): Promise<ProbeResult> =>
        context.connect.trustCertificate(textArg(url, MAX_ADDRESS), textArg(fingerprint, MAX_FINGERPRINT)));

    handle(Ipc.shellConnect, 'shell', (url): Promise<ProbeResult> => context.connect.connect(textArg(url, MAX_ADDRESS)));

    handle(Ipc.shellOpen, 'shell', (id): void => {
        const server = context.servers.touch(textArg(id, 64));
        if (!server) throw new Error('That server is no longer saved.');
        window.showServer(server);
    });

    handle(Ipc.shellForget, 'shell', (id): SavedServer[] => context.servers.forget(textArg(id, 64)));

    listen(Ipc.shellRetry, ['shell'], () => window.retry());
}

import { app, Notification, shell } from 'electron';
import { autoUpdater, type UpdateInfo } from 'electron-updater';
import type { DesktopChannel, DesktopPlatform } from '../shared/bridge';
import type { FileLogger } from './logger';
import { CHECK_EVERY_MS, FIRST_CHECK_MS, installKind, noticeFor, releasePage, updateSettings, type InstallKind } from './updatePolicy';

const DEFERRED_NOTICE_MS = 60 * 1000;

export interface UpdaterOptions {
    channel: DesktopChannel;
    platform: DesktopPlatform;
    logger: FileLogger;
    isPlaying: () => boolean;
    readyChanged: (version: string | null) => void;
}

export class Updater {
    private readonly options: UpdaterOptions;
    private readonly kind: InstallKind;
    private ready: string | null = null;
    private noticePending: UpdateInfo | null = null;

    constructor(options: UpdaterOptions) {
        this.options = options;
        this.kind = installKind(options.platform, process.env.APPIMAGE);
    }

    start(): void {
        if (!app.isPackaged) return;
        const { logger } = this.options;
        const settings = updateSettings(this.options.channel, this.kind);
        autoUpdater.logger = {
            info: (message: string) => logger.info('Updater', String(message)),
            warn: (message: string) => logger.warn('Updater', String(message)),
            error: (message: string) => logger.warn('Updater failed', String(message)),
        };
        autoUpdater.channel = settings.channel;
        autoUpdater.allowPrerelease = settings.allowPrerelease;
        autoUpdater.allowDowngrade = false;
        autoUpdater.autoDownload = settings.autoDownload;
        autoUpdater.autoInstallOnAppQuit = settings.autoInstallOnAppQuit;

        autoUpdater.on('update-available', (info: UpdateInfo) => {
            if (this.kind === 'package') this.announce(info);
        });
        autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
            this.ready = info.version;
            this.options.readyChanged(info.version);
            this.announce(info);
        });
        autoUpdater.on('error', error => logger.warn('Could not check for updates', error));

        setTimeout(() => this.check(), FIRST_CHECK_MS);
        setInterval(() => this.check(), CHECK_EVERY_MS);
        setInterval(() => this.retryNotice(), DEFERRED_NOTICE_MS);
    }

    restartToUpdate(): void {
        if (!this.ready || this.options.isPlaying()) return;
        this.options.logger.info(`Restarting to install ${this.ready}`);
        autoUpdater.quitAndInstall();
    }

    private check(): void {
        autoUpdater.checkForUpdates().catch((error: unknown) => this.options.logger.warn('Could not check for updates', error));
    }

    private announce(info: UpdateInfo): void {
        if (this.options.isPlaying() || !Notification.isSupported()) {
            this.noticePending = info;
            return;
        }
        this.noticePending = null;
        const notice = noticeFor(this.kind, info.version, app.getName());
        const notification = new Notification({ title: notice.title, body: notice.body, silent: true });
        notification.on('click', () => {
            if (this.kind === 'package') void shell.openExternal(releasePage(info.version));
            else this.restartToUpdate();
        });
        notification.show();
    }

    private retryNotice(): void {
        if (this.noticePending && !this.options.isPlaying()) this.announce(this.noticePending);
    }
}

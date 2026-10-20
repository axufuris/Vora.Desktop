import type { DesktopChannel, DesktopPlatform } from '../shared/bridge';

export const RELEASES_URL = 'https://github.com/axufuris/Vora.Desktop/releases';
export const FIRST_CHECK_MS = 30 * 1000;
export const CHECK_EVERY_MS = 60 * 60 * 1000;
export const FOCUS_CHECK_GAP_MS = 15 * 60 * 1000;

export function dueOnFocus(lastCheckedAt: number | null, now: number): boolean {
    return lastCheckedAt !== null && now - lastCheckedAt >= FOCUS_CHECK_GAP_MS;
}

export type InstallKind = 'self-updating' | 'package';

export interface UpdateSettings {
    channel: string;
    allowPrerelease: boolean;
    autoDownload: boolean;
    autoInstallOnAppQuit: boolean;
}

export function installKind(platform: DesktopPlatform, appImage: string | undefined): InstallKind {
    return platform === 'linux' && !appImage ? 'package' : 'self-updating';
}

export function updateSettings(channel: DesktopChannel, kind: InstallKind): UpdateSettings {
    const downloads = kind === 'self-updating';
    return {
        channel: channel === 'qa' ? 'qa' : 'latest',
        allowPrerelease: channel === 'qa',
        autoDownload: downloads,
        autoInstallOnAppQuit: downloads,
    };
}

export function releasePage(version: string): string {
    return `${RELEASES_URL}/tag/v${encodeURIComponent(version)}`;
}

export function noticeFor(kind: InstallKind, version: string, productName: string): { title: string; body: string } {
    return kind === 'package'
        ? { title: `${productName} ${version} is available`, body: 'Click to open the download page.' }
        : { title: `${productName} ${version} is ready`, body: 'Click to restart and update. It also installs the next time you quit.' };
}

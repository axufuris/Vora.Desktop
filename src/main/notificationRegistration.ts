import { existsSync } from 'node:fs';
import { app, shell } from 'electron';
import type { AppIdentity } from './appIdentity';
import type { FileLogger } from './logger';
import { shortcutChange, startMenuShortcut } from './notificationShortcut';

export function prepareWindowsNotifications(identity: AppIdentity, logger: FileLogger): void {
    const link = startMenuShortcut(app.getPath('appData'), identity.productName);
    const ids = { appUserModelId: identity.appId, toastActivatorClsid: identity.toastActivator };
    try {
        const current = existsSync(link) ? shell.readShortcutLink(link) : null;
        if (shortcutChange(current, identity) === 'none') return;
        const written = current
            ? shell.writeShortcutLink(link, 'update', { ...current, ...ids })
            : shell.writeShortcutLink(link, 'create', { target: process.execPath, ...ids });
        if (written) logger.info('Registered for Windows notifications', link);
        else logger.warn('Could not register for Windows notifications', link);
    } catch (error) {
        logger.warn('Could not register for Windows notifications', error);
    }
}

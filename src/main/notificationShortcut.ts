import { join } from 'node:path';
import type { AppIdentity } from './appIdentity';

export interface ShortcutIds {
    appUserModelId?: string;
    toastActivatorClsid?: string;
}

export type ShortcutChange = 'none' | 'update' | 'create';

export function startMenuShortcut(appData: string, productName: string): string {
    return join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs', `${productName}.lnk`);
}

export function shortcutChange(current: ShortcutIds | null, identity: AppIdentity): ShortcutChange {
    if (!current) return 'create';
    const sameApp = current.appUserModelId === identity.appId;
    const sameActivator = (current.toastActivatorClsid ?? '').toUpperCase() === identity.toastActivator.toUpperCase();
    return sameApp && sameActivator ? 'none' : 'update';
}

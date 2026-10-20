import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { appIdentity } from './appIdentity';
import { shortcutChange, startMenuShortcut } from './notificationShortcut';

const qa = appIdentity('qa');

describe('the Start menu shortcut Windows notifications need', () => {
    it('is the one the installer makes, named after the app', () => {
        expect(startMenuShortcut('C:\\Users\\me\\AppData\\Roaming', 'Vora QA'))
            .toBe(join('C:\\Users\\me\\AppData\\Roaming', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Vora QA.lnk'));
    });

    it('is left alone when it already carries the app id and notification id, whatever their case', () => {
        expect(shortcutChange({ appUserModelId: qa.appId, toastActivatorClsid: qa.toastActivator.toLowerCase() }, qa)).toBe('none');
    });

    it('is updated when the installer left the notification id out or Electron wrote its own app id', () => {
        expect(shortcutChange({ appUserModelId: qa.appId }, qa)).toBe('update');
        expect(shortcutChange({ appUserModelId: 'electron.app.Vora QA', toastActivatorClsid: qa.toastActivator }, qa)).toBe('update');
    });

    it('is created when there is none', () => {
        expect(shortcutChange(null, qa)).toBe('create');
    });
});

describe('the two apps', () => {
    it('have their own app id, name, notification id and icon', () => {
        const prod = appIdentity('prod');

        expect(prod).toMatchObject({ appId: 'net.getvora.desktop', productName: 'Vora', executableName: 'vora-desktop' });
        expect(qa).toMatchObject({ appId: 'net.getvora.desktop.qa', productName: 'Vora QA', executableName: 'vora-desktop-qa' });
        expect(prod.toastActivator).not.toBe(qa.toastActivator);
        expect(prod.icon).not.toBe(qa.icon);
        for (const identity of [prod, qa]) expect(identity.toastActivator).toMatch(/^\{[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}\}$/);
    });
});

import { describe, expect, it } from 'vitest';
import { CHECK_EVERY_MS, dueOnFocus, FIRST_CHECK_MS, FOCUS_CHECK_GAP_MS, installKind, noticeFor, releasePage, updateSettings } from './updatePolicy';

describe('updating Vora Desktop', () => {
    it('updates itself on Windows and from an AppImage, and only points .deb and .rpm installs at the download', () => {
        expect(installKind('windows', undefined)).toBe('self-updating');
        expect(installKind('linux', '/home/me/Apps/Vora-1.0.0.AppImage')).toBe('self-updating');
        expect(installKind('linux', undefined)).toBe('package');
    });

    it('keeps QA on QA prereleases and prod on releases', () => {
        expect(updateSettings('qa', 'self-updating')).toEqual({ channel: 'qa', allowPrerelease: true, autoDownload: true, autoInstallOnAppQuit: true });
        expect(updateSettings('prod', 'self-updating')).toEqual({ channel: 'latest', allowPrerelease: false, autoDownload: true, autoInstallOnAppQuit: true });
        expect(updateSettings('prod', 'package')).toMatchObject({ autoDownload: false, autoInstallOnAppQuit: false });
    });

    it('looks 30 seconds after start, then every hour, and again on focus once 15 minutes have passed', () => {
        expect([FIRST_CHECK_MS, CHECK_EVERY_MS, FOCUS_CHECK_GAP_MS]).toEqual([30_000, 3_600_000, 900_000]);
        expect(dueOnFocus(null, 10_000_000)).toBe(false);
        expect(dueOnFocus(1_000_000, 1_000_000 + FOCUS_CHECK_GAP_MS - 1)).toBe(false);
        expect(dueOnFocus(1_000_000, 1_000_000 + FOCUS_CHECK_GAP_MS)).toBe(true);
    });

    it('says what to do with the new version', () => {
        expect(noticeFor('package', '1.1.0', 'Vora')).toEqual({ title: 'Vora 1.1.0 is available', body: 'Click to open the download page.' });
        expect(noticeFor('self-updating', '1.1.0-qa.58', 'Vora QA').title).toBe('Vora QA 1.1.0-qa.58 is ready');
        expect(releasePage('1.1.0')).toBe('https://github.com/axufuris/Vora.Desktop/releases/tag/v1.1.0');
    });
});

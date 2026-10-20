import { describe, expect, it } from 'vitest';
import { isOnScreen, windowStateFrom } from './windowState';

const laptop = { x: 0, y: 0, width: 1920, height: 1040 };
const leftMonitor = { x: -2560, y: 0, width: 2560, height: 1400 };

describe('the remembered window position', () => {
    it('is read back as it was saved', () => {
        expect(windowStateFrom({ x: 40, y: 30, width: 1600, height: 900, maximized: false })).toEqual({ x: 40, y: 30, width: 1600, height: 900, maximized: false });
    });

    it('is ignored when damaged or too small to use', () => {
        expect(windowStateFrom({ x: 40, y: 30, width: 200, height: 900, maximized: false })).toBeNull();
        expect(windowStateFrom({ x: '40', y: 30, width: 1600, height: 900, maximized: false })).toBeNull();
        expect(windowStateFrom(null)).toBeNull();
    });

    it('is used only while a screen still shows the window', () => {
        const onLeft = { x: -2400, y: 50, width: 1600, height: 900, maximized: false };

        expect(isOnScreen(onLeft, [laptop, leftMonitor])).toBe(true);
        expect(isOnScreen(onLeft, [laptop])).toBe(false);
        expect(isOnScreen({ x: 100, y: -500, width: 1600, height: 900, maximized: false }, [laptop])).toBe(false);
    });
});

import type { JsonValue } from './values';
import { isFiniteNumber, isRecord } from './values';

export interface WindowState {
    x: number;
    y: number;
    width: number;
    height: number;
    maximized: boolean;
}

export interface Area {
    x: number;
    y: number;
    width: number;
    height: number;
}

export const MIN_WIDTH = 960;
export const MIN_HEIGHT = 600;

export function windowStateFrom(value: JsonValue): WindowState | null {
    if (!isRecord(value)) return null;
    const { x, y, width, height, maximized } = value;
    if (!isFiniteNumber(x) || !isFiniteNumber(y) || !isFiniteNumber(width) || !isFiniteNumber(height)) return null;
    if (width < MIN_WIDTH || height < MIN_HEIGHT || typeof maximized !== 'boolean') return null;
    return { x, y, width, height, maximized };
}

export function isOnScreen(state: WindowState, workAreas: readonly Area[]): boolean {
    return workAreas.some(area =>
        state.x < area.x + area.width - 100
        && state.x + state.width > area.x + 100
        && state.y >= area.y - 10
        && state.y < area.y + area.height - 100);
}

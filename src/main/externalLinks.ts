import { isServerPage } from './navigation';
import type { IpcValue } from './values';

const MAX_ADDRESS = 4096;

export function browserAddressFrom(value: IpcValue, serverOrigin: string | null): string | null {
    if (typeof value !== 'string' || value.length > MAX_ADDRESS || !isServerPage(value, serverOrigin)) return null;
    try {
        const parsed = new URL(value);
        return parsed.username === '' && parsed.password === '' ? parsed.href : null;
    } catch {
        return null;
    }
}

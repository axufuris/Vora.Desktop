import { isServerPage, popupVerdict } from './navigation';
import type { IpcValue } from './values';

const MAX_ADDRESS = 4096;

export function browserAddressFrom(value: IpcValue, serverOrigin: string | null): string | null {
    if (typeof value !== 'string' || value.length > MAX_ADDRESS || !serverOrigin) return null;
    try {
        const parsed = new URL(value);
        if (parsed.username !== '' || parsed.password !== '') return null;
        return isServerPage(value, serverOrigin) || popupVerdict(value) === 'external' ? parsed.href : null;
    } catch {
        return null;
    }
}

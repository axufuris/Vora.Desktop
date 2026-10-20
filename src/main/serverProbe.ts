import type { JsonValue } from './values';
import { isRecord } from './values';

export const PROBE_TIMEOUT_MS = 10_000;

export function normaliseServerUrl(input: string): string | null {
    const trimmed = input.trim();
    if (!trimmed) return null;
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

    let url: URL;
    try {
        url = new URL(withScheme);
    } catch {
        return null;
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    if (!url.hostname || url.username || url.password) return null;

    const path = url.pathname.replace(/\/+$/, '');
    return `${url.protocol}//${url.host}${path}`;
}

export function hostOf(serverUrl: string): string {
    return new URL(serverUrl).hostname;
}

export function originOf(serverUrl: string): string {
    return new URL(serverUrl).origin;
}

export type ProbeOutcome =
    | { kind: 'ok'; name: string }
    | { kind: 'not-vora' }
    | { kind: 'failed'; message: string };

export type Fetcher = (url: string, init: { signal: AbortSignal; headers: Record<string, string> }) => Promise<Response>;

function serverNameFrom(value: JsonValue): string | null {
    if (!isRecord(value)) return null;
    const name = value.serverName;
    if (typeof name === 'string' && name.trim()) return name.trim();
    return 'isClaimed' in value ? 'Vora' : null;
}

export async function probeServer(serverUrl: string, fetcher: Fetcher, timeoutMs = PROBE_TIMEOUT_MS): Promise<ProbeOutcome> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetcher(`${serverUrl}/api/auth/setup-status`, {
            signal: controller.signal,
            headers: { Accept: 'application/json' },
        });
        if (!response.ok) return { kind: 'not-vora' };
        const text = await response.text();
        let body: JsonValue;
        try {
            body = JSON.parse(text);
        } catch {
            return { kind: 'not-vora' };
        }
        const name = serverNameFrom(body);
        return name ? { kind: 'ok', name } : { kind: 'not-vora' };
    } catch (error: unknown) {
        if (controller.signal.aborted) return { kind: 'failed', message: 'The server did not answer in time.' };
        return { kind: 'failed', message: error instanceof Error && error.message ? error.message : 'The server could not be reached.' };
    } finally {
        clearTimeout(timer);
    }
}

import type { DesktopChannel } from '../shared/bridge';
import type { ProbeResult } from '../shared/shell';

export function versionLine(version: string, channel: DesktopChannel): string {
    return `Vora Desktop ${version}${channel === 'qa' ? ' (QA)' : ''}`;
}

export interface TrustText {
    title: string;
    text: string;
}

export function trustText(changed: boolean, name: string): TrustText {
    return changed
        ? {
            title: `${name}'s certificate changed`,
            text: "This isn't the certificate you trusted before. If you didn't change it on your server, don't trust it.",
        }
        : {
            title: `${name} uses a certificate this computer doesn't trust`,
            text: 'That is common for a home server. Check that this fingerprint matches the certificate your server uses before you trust it.',
        };
}

export function problemText(result: Exclude<ProbeResult, { kind: 'ok' } | { kind: 'untrusted' }>): string {
    switch (result.kind) {
        case 'invalid':
            return result.message;
        case 'unreachable':
            return `Couldn't reach ${result.url}. ${result.message}`;
        case 'not-vora':
            return `${result.url} answered, but it isn't a Vora server. Check the address and the port.`;
    }
}

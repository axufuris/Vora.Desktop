import type { LoadFailure } from '../shared/shell';

export const ERR_ABORTED = -3;

const FRIENDLY: Record<number, string> = {
    [-102]: 'The server refused the connection. Check that Vora is running.',
    [-105]: "The server's name could not be found. Check the address.",
    [-106]: 'This computer is offline.',
    [-109]: 'The server could not be reached from this network.',
    [-118]: 'The server did not answer in time.',
    [-137]: "The server's name could not be found. Check the address.",
};

export function isCertificateError(errorCode: number): boolean {
    return errorCode <= -200 && errorCode > -300;
}

export function friendlyMessage(errorCode: number, description: string): string {
    return FRIENDLY[errorCode] ?? (description ? `The page could not be loaded (${description}).` : 'The page could not be loaded.');
}

export function failureQuery(failure: LoadFailure, serverName: string): Record<string, string> {
    if (failure.kind === 'unreachable') return { kind: 'unreachable', url: failure.url, name: serverName, message: failure.message };
    return {
        kind: 'untrusted',
        url: failure.url,
        name: serverName,
        host: failure.host,
        fingerprint: failure.fingerprint,
        changed: failure.changed ? 'true' : 'false',
    };
}

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SavedServer } from '../shared/shell';
import { CertTrust } from './certTrust';
import { ConnectFlow, INVALID_ADDRESS, INVALID_CERTIFICATE } from './connectFlow';
import type { Fetcher } from './serverProbe';
import { ServerStore } from './serverStore';

const FINGERPRINT = 'AB:CD:EF';

let folder = '';

beforeEach(() => {
    folder = mkdtempSync(join(tmpdir(), 'vora-connect-'));
});

afterEach(() => {
    rmSync(folder, { recursive: true, force: true });
});

function setup(answer: (url: string, trust: CertTrust, hosts: Set<string>) => Promise<Response>) {
    const trust = new CertTrust(join(folder, 'certTrust.json'));
    const servers = new ServerStore(join(folder, 'servers.json'));
    const shown: SavedServer[] = [];
    let pendingHost: string | null = null;
    const target = {
        setPendingHost: (host: string | null) => { pendingHost = host; },
        showServer: (server: SavedServer) => { shown.push(server); },
    };
    const fetcher: Fetcher = url => answer(url, trust, new Set(pendingHost ? [pendingHost] : []));
    const changes: number[] = [];
    const certificatesChanged = () => { changes.push(Date.now()); return Promise.resolve(); };
    return { flow: new ConnectFlow({ fetcher, trust, servers, target, certificatesChanged }), servers, shown, changes };
}

const vora = (name: string) => new Response(JSON.stringify({ isClaimed: true, serverName: name }), { status: 200 });

function selfSignedServer() {
    let checked = false;
    return (_url: string, trust: CertTrust, hosts: Set<string>): Promise<Response> => {
        if (trust.pinnedFingerprint('nas.local') === FINGERPRINT) return Promise.resolve(vora('Living Room'));
        if (!checked) {
            checked = true;
            trust.verdict('nas.local', FINGERPRINT, hosts);
        }
        return Promise.reject(new Error('net::ERR_CERT_AUTHORITY_INVALID'));
    };
}

describe('connecting to a server', () => {
    it('saves the server it found and opens it', async () => {
        const { flow, servers, shown } = setup(() => Promise.resolve(vora('Living Room')));

        const result = await flow.connect('nas.local:5000');

        expect(result).toEqual({ kind: 'ok', url: 'https://nas.local:5000', name: 'Living Room' });
        expect(servers.last()?.name).toBe('Living Room');
        expect(shown).toHaveLength(1);
    });

    it('opens nothing when the server is not found', async () => {
        const { flow, servers, shown } = setup(() => Promise.reject(new Error('net::ERR_CONNECTION_REFUSED')));

        expect(await flow.connect('nas.local')).toEqual({ kind: 'unreachable', url: 'https://nas.local', message: 'net::ERR_CONNECTION_REFUSED' });
        expect(servers.servers()).toEqual([]);
        expect(shown).toEqual([]);
    });

    it('explains an address it cannot use', async () => {
        const { flow } = setup(() => Promise.resolve(vora('x')));

        expect(await flow.probe('ftp://nas.local')).toEqual({ kind: 'invalid', message: INVALID_ADDRESS });
    });
});

describe('a self-signed home server', () => {
    it('is reported with the fingerprint, also when the browser only checked the certificate once', async () => {
        const { flow } = setup(selfSignedServer());

        const first = await flow.probe('https://nas.local');
        const again = await flow.probe('https://nas.local');

        expect(first).toEqual({ kind: 'untrusted', url: 'https://nas.local', host: 'nas.local', fingerprint: FINGERPRINT, changed: false });
        expect(again).toEqual(first);
    });

    it('is reached once its fingerprint is trusted, with certificates checked afresh', async () => {
        const { flow, servers, changes } = setup(selfSignedServer());
        await flow.probe('https://nas.local');
        await flow.probe('https://nas.local');

        expect(await flow.trustCertificate('https://nas.local', FINGERPRINT)).toEqual({ kind: 'ok', url: 'https://nas.local', name: 'Living Room' });
        expect(changes).toHaveLength(1);
        expect((await flow.connect('https://nas.local')).kind).toBe('ok');
        expect(servers.last()?.url).toBe('https://nas.local');
    });

    it('stays untrusted when a different fingerprint is offered', async () => {
        const { flow, changes } = setup(selfSignedServer());
        await flow.probe('https://nas.local');

        expect((await flow.trustCertificate('https://nas.local', '00:11:22')).kind).toBe('untrusted');
        expect(changes).toEqual([]);
    });

    it('is called invalid when no fingerprint was seen for it', async () => {
        const { flow } = setup(() => Promise.reject(new Error('net::ERR_CERT_COMMON_NAME_INVALID')));

        expect(await flow.probe('https://nas.local')).toEqual({ kind: 'unreachable', url: 'https://nas.local', message: INVALID_CERTIFICATE });
    });
});

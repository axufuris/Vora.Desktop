import { afterEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { normaliseServerUrl, probeServer } from './serverProbe';

let server: Server | null = null;

async function serve(handler: (path: string) => { status: number; body: string } | null): Promise<string> {
    server = createServer((request, response) => {
        const answer = handler(request.url ?? '/');
        if (!answer) return;
        response.writeHead(answer.status, { 'Content-Type': 'application/json' });
        response.end(answer.body);
    });
    await new Promise<void>(resolve => server?.listen(0, '127.0.0.1', resolve));
    const address = server.address() as AddressInfo;
    return `http://127.0.0.1:${address.port}`;
}

afterEach(async () => {
    server?.closeAllConnections();
    await new Promise<void>(resolve => (server ? server.close(() => resolve()) : resolve()));
    server = null;
});

describe('a server address typed on the connect page', () => {
    it('defaults to https and drops a trailing slash', () => {
        expect(normaliseServerUrl(' vora.example.com/ ')).toBe('https://vora.example.com');
    });

    it('keeps a port and a plain http LAN address', () => {
        expect(normaliseServerUrl('nas.local:5000')).toBe('https://nas.local:5000');
        expect(normaliseServerUrl('http://192.168.1.20:5000')).toBe('http://192.168.1.20:5000');
    });

    it('keeps a path a reverse proxy serves Vora under, without query or fragment', () => {
        expect(normaliseServerUrl('https://home.example.com/vora/?x=1#top')).toBe('https://home.example.com/vora');
    });

    it('refuses what is not a web address', () => {
        expect(normaliseServerUrl('')).toBeNull();
        expect(normaliseServerUrl('file:///etc/passwd')).toBeNull();
        expect(normaliseServerUrl('ftp://vora.example.com')).toBeNull();
        expect(normaliseServerUrl('https://user:secret@vora.example.com')).toBeNull();
    });
});

describe('probing a server', () => {
    it('reads the server name from the setup status the login page uses', async () => {
        const url = await serve(path => (path === '/api/auth/setup-status'
            ? { status: 200, body: JSON.stringify({ isClaimed: true, registrationMode: 0, serverName: 'Living Room', emailEnabled: false }) }
            : { status: 404, body: '{}' }));

        expect(await probeServer(url, fetch)).toEqual({ kind: 'ok', name: 'Living Room' });
    });

    it('calls a server with no name set "Vora"', async () => {
        const url = await serve(() => ({ status: 200, body: JSON.stringify({ isClaimed: false, serverName: '' }) }));

        expect(await probeServer(url, fetch)).toEqual({ kind: 'ok', name: 'Vora' });
    });

    it('says when something else answers', async () => {
        const url = await serve(() => ({ status: 200, body: '<html>router login</html>' }));

        expect(await probeServer(url, fetch)).toEqual({ kind: 'not-vora' });
    });

    it('gives up on a server that never answers', async () => {
        const url = await serve(() => null);

        expect(await probeServer(url, fetch, 50)).toEqual({ kind: 'failed', message: 'The server did not answer in time.' });
    });

    it('reports a server that is not there', async () => {
        const result = await probeServer('http://127.0.0.1:1', fetch);

        expect(result.kind).toBe('failed');
    });
});

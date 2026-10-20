import { randomUUID } from 'node:crypto';
import { createServer, type Server, type Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { MpvCommandError, MpvIpc, splitMessages, type MpvMessage } from './mpvIpc';

const pipePath = () => process.platform === 'win32' ? `\\\\.\\pipe\\vora-test-${randomUUID()}` : join(tmpdir(), `vora-test-${randomUUID()}.sock`);

let server: Server | null = null;

afterEach(() => {
    server?.close();
    server = null;
});

function fakeMpv(path: string, answer: (request: { command: (string | number | boolean)[]; request_id: number }, socket: Socket) => void): Promise<void> {
    return new Promise(resolve => {
        server = createServer(socket => {
            socket.setEncoding('utf8');
            let buffer = '';
            socket.on('data', (chunk: string) => {
                buffer += chunk;
                const lines = buffer.split('\n');
                buffer = lines.pop() ?? '';
                for (const line of lines) if (line) answer(JSON.parse(line), socket);
            });
        });
        server.listen(path, resolve);
    });
}

describe('reading mpv\'s messages', () => {
    it('splits whole lines and keeps a partial one for later', () => {
        const { messages, rest } = splitMessages('{"event":"file-loaded"}\n{"request_id":1,"error":"success"}\n{"event":"pro');

        expect(messages).toEqual([{ event: 'file-loaded' }, { request_id: 1, error: 'success' }]);
        expect(rest).toBe('{"event":"pro');
    });

    it('skips lines that are not JSON objects', () => {
        expect(splitMessages('garbage\n[1,2]\n\n{"event":"idle"}\n').messages).toEqual([{ event: 'idle' }]);
    });
});

describe('talking to mpv', () => {
    it('matches each answer to its command and passes events on', async () => {
        const path = pipePath();
        await fakeMpv(path, (request, socket) => {
            socket.write('{"event":"property-change","id":1,"name":"pause","data":false}\n');
            if (request.command[0] === 'get_property') socket.write(`{"request_id":${request.request_id},"error":"success","data":"2.5"}\n`);
            else socket.write(`{"request_id":${request.request_id},"error":"property not found"}\n`);
        });
        const ipc = await MpvIpc.connect(path, Date.now() + 2000, () => true);
        const events: MpvMessage[] = [];
        ipc.onMessage(message => events.push(message));

        await expect(ipc.command(['get_property', 'time-pos'])).resolves.toBe('2.5');
        await expect(ipc.command(['set_property', 'nonsense', 1])).rejects.toThrow(MpvCommandError);
        expect(events).toEqual([
            { event: 'property-change', id: 1, name: 'pause', data: false },
            { event: 'property-change', id: 1, name: 'pause', data: false },
        ]);
        ipc.close();
    });

    it('waits for mpv to open its socket', async () => {
        const path = pipePath();
        setTimeout(() => void fakeMpv(path, (request, socket) => socket.write(`{"request_id":${request.request_id},"error":"success"}\n`)), 200);

        const ipc = await MpvIpc.connect(path, Date.now() + 3000, () => true);

        await expect(ipc.command(['quit'])).resolves.toBeNull();
        ipc.close();
    });

    it('gives up when mpv stops first, and fails what was waiting when the connection drops', async () => {
        await expect(MpvIpc.connect(pipePath(), Date.now() + 3000, () => false)).rejects.toThrow('mpv stopped');

        const path = pipePath();
        await fakeMpv(path, (_request, socket) => socket.destroy());
        const ipc = await MpvIpc.connect(path, Date.now() + 2000, () => true);
        let closed = false;
        ipc.onClose(() => { closed = true; });

        await expect(ipc.command(['get_property', 'pause'])).rejects.toThrow('the connection closed');
        expect(closed).toBe(true);
        expect(ipc.isClosed).toBe(true);
    });
});

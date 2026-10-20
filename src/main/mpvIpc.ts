import { connect, type Socket } from 'node:net';
import type { JsonValue } from './values';

export type MpvMessage = { [key: string]: JsonValue };

export type MpvArgument = string | number | boolean;

const COMMAND_TIMEOUT_MS = 5000;
const CONNECT_RETRY_MS = 50;

export class MpvCommandError extends Error {
    constructor(command: readonly MpvArgument[], reason: string) {
        super(`mpv refused ${String(command[0])}: ${reason}`);
    }
}

export function splitMessages(buffer: string): { messages: MpvMessage[]; rest: string } {
    const lines = buffer.split('\n');
    const rest = lines.pop() ?? '';
    const messages: MpvMessage[] = [];
    for (const line of lines) {
        const text = line.trim();
        if (!text) continue;
        try {
            const value: JsonValue = JSON.parse(text);
            if (typeof value === 'object' && value !== null && !Array.isArray(value)) messages.push(value);
        } catch {
            continue;
        }
    }
    return { messages, rest };
}

interface Pending {
    command: readonly MpvArgument[];
    resolve: (value: JsonValue) => void;
    reject: (error: Error) => void;
    timer: NodeJS.Timeout;
}

export class MpvIpc {
    private readonly socket: Socket;
    private buffer = '';
    private nextRequest = 1;
    private readonly pending = new Map<number, Pending>();
    private readonly messageHandlers = new Set<(message: MpvMessage) => void>();
    private readonly closeHandlers = new Set<() => void>();
    private closed = false;

    constructor(socket: Socket) {
        this.socket = socket;
        socket.setEncoding('utf8');
        socket.on('data', (chunk: string) => this.receive(chunk));
        socket.on('error', () => this.shutDown());
        socket.on('close', () => this.shutDown());
    }

    static connect(path: string, deadline: number, stillWanted: () => boolean): Promise<MpvIpc> {
        return new Promise((resolve, reject) => {
            const attempt = () => {
                const socket = connect(path);
                socket.once('connect', () => {
                    socket.removeAllListeners('error');
                    resolve(new MpvIpc(socket));
                });
                socket.once('error', (error: NodeJS.ErrnoException) => {
                    socket.destroy();
                    if (!stillWanted()) reject(new Error('mpv stopped before Vora could talk to it.'));
                    else if (Date.now() >= deadline) reject(new Error(`Could not reach mpv: ${error.code ?? error.message}`));
                    else setTimeout(attempt, CONNECT_RETRY_MS);
                });
            };
            attempt();
        });
    }

    get isClosed(): boolean {
        return this.closed;
    }

    command(command: readonly MpvArgument[], timeoutMs = COMMAND_TIMEOUT_MS): Promise<JsonValue> {
        if (this.closed) return Promise.reject(new MpvCommandError(command, 'the connection is closed'));
        const id = this.nextRequest++;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(id);
                reject(new MpvCommandError(command, 'no answer'));
            }, timeoutMs);
            this.pending.set(id, { command, resolve, reject, timer });
            this.socket.write(`${JSON.stringify({ command, request_id: id })}\n`);
        });
    }

    send(command: readonly MpvArgument[]): void {
        this.command(command).catch(() => undefined);
    }

    onMessage(handler: (message: MpvMessage) => void): () => void {
        this.messageHandlers.add(handler);
        return () => { this.messageHandlers.delete(handler); };
    }

    onClose(handler: () => void): void {
        if (this.closed) handler();
        else this.closeHandlers.add(handler);
    }

    close(): void {
        this.socket.destroy();
        this.shutDown();
    }

    private receive(chunk: string): void {
        const { messages, rest } = splitMessages(this.buffer + chunk);
        this.buffer = rest;
        for (const message of messages) this.dispatch(message);
    }

    private dispatch(message: MpvMessage): void {
        const id = message.request_id;
        if (typeof id === 'number' && this.pending.has(id) && message.event === undefined) {
            const pending = this.pending.get(id);
            this.pending.delete(id);
            if (!pending) return;
            clearTimeout(pending.timer);
            if (message.error === 'success') pending.resolve(message.data ?? null);
            else pending.reject(new MpvCommandError(pending.command, typeof message.error === 'string' ? message.error : 'unknown error'));
            return;
        }
        for (const handler of this.messageHandlers) handler(message);
    }

    private shutDown(): void {
        if (this.closed) return;
        this.closed = true;
        for (const pending of this.pending.values()) {
            clearTimeout(pending.timer);
            pending.reject(new MpvCommandError(pending.command, 'the connection closed'));
        }
        this.pending.clear();
        for (const handler of this.closeHandlers) handler();
        this.closeHandlers.clear();
    }
}

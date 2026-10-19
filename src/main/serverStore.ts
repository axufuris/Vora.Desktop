import { randomUUID } from 'node:crypto';
import type { SavedServer } from '../shared/shell';
import { readJson, writeJson } from './jsonFile';
import type { JsonValue } from './values';
import { isRecord } from './values';

interface ServerList {
    servers: SavedServer[];
    lastServerId: string | null;
}

const Empty: ServerList = { servers: [], lastServerId: null };

function serverFrom(value: JsonValue): SavedServer | null {
    if (!isRecord(value)) return null;
    const { id, url, name, lastUsedAt } = value;
    if (typeof id !== 'string' || typeof url !== 'string' || typeof name !== 'string' || typeof lastUsedAt !== 'string') return null;
    return { id, url, name, lastUsedAt };
}

function listFrom(value: JsonValue): ServerList {
    if (!isRecord(value) || !Array.isArray(value.servers)) return Empty;
    const servers = value.servers.flatMap(entry => {
        const server = serverFrom(entry);
        return server ? [server] : [];
    });
    const lastServerId = typeof value.lastServerId === 'string' && servers.some(s => s.id === value.lastServerId) ? value.lastServerId : null;
    return { servers, lastServerId };
}

function byLastUsed(servers: SavedServer[]): SavedServer[] {
    return [...servers].sort((a, b) => b.lastUsedAt.localeCompare(a.lastUsedAt));
}

export class ServerStore {
    private readonly path: string;
    private readonly now: () => Date;
    private list: ServerList;

    constructor(path: string, now: () => Date = () => new Date()) {
        this.path = path;
        this.now = now;
        this.list = readJson(path, listFrom, Empty);
    }

    servers(): SavedServer[] {
        return byLastUsed(this.list.servers);
    }

    last(): SavedServer | null {
        return this.list.servers.find(server => server.id === this.list.lastServerId) ?? null;
    }

    find(id: string): SavedServer | null {
        return this.list.servers.find(server => server.id === id) ?? null;
    }

    use(url: string, name: string): SavedServer {
        const lastUsedAt = this.now().toISOString();
        const existing = this.list.servers.find(server => server.url === url);
        const server: SavedServer = existing ? { ...existing, name, lastUsedAt } : { id: randomUUID(), url, name, lastUsedAt };
        this.save({
            servers: [...this.list.servers.filter(entry => entry.id !== server.id), server],
            lastServerId: server.id,
        });
        return server;
    }

    touch(id: string): SavedServer | null {
        const server = this.find(id);
        return server ? this.use(server.url, server.name) : null;
    }

    forget(id: string): SavedServer[] {
        this.save({
            servers: this.list.servers.filter(server => server.id !== id),
            lastServerId: this.list.lastServerId === id ? null : this.list.lastServerId,
        });
        return this.servers();
    }

    private save(list: ServerList): void {
        this.list = list;
        writeJson(this.path, { servers: list.servers.map(server => ({ ...server })), lastServerId: list.lastServerId });
    }
}

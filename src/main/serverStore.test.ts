import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ServerStore } from './serverStore';

let folder = '';
let clock = 0;
const now = () => new Date(Date.UTC(2026, 9, 19, 12, 0, clock++));

beforeEach(() => {
    folder = mkdtempSync(join(tmpdir(), 'vora-servers-'));
    clock = 0;
});

afterEach(() => {
    rmSync(folder, { recursive: true, force: true });
});

describe('the saved servers', () => {
    it('start empty', () => {
        const store = new ServerStore(join(folder, 'servers.json'), now);

        expect(store.servers()).toEqual([]);
        expect(store.last()).toBeNull();
    });

    it('remember the last server used, across restarts', () => {
        const path = join(folder, 'servers.json');
        const store = new ServerStore(path, now);
        store.use('https://home.example.com', 'Home');
        const office = store.use('https://office.example.com', 'Office');

        const reopened = new ServerStore(path, now);

        expect(reopened.last()).toEqual(office);
        expect(reopened.servers().map(server => server.name)).toEqual(['Office', 'Home']);
    });

    it('keep one entry per address and take its new name', () => {
        const store = new ServerStore(join(folder, 'servers.json'), now);
        const first = store.use('https://home.example.com', 'Home');

        const again = store.use('https://home.example.com', 'Living Room');

        expect(again.id).toBe(first.id);
        expect(store.servers()).toHaveLength(1);
        expect(store.last()?.name).toBe('Living Room');
    });

    it('forget a server, and the last-used one with it', () => {
        const store = new ServerStore(join(folder, 'servers.json'), now);
        const home = store.use('https://home.example.com', 'Home');

        expect(store.forget(home.id)).toEqual([]);
        expect(store.last()).toBeNull();
    });

    it('start over when the file is damaged', () => {
        const path = join(folder, 'servers.json');
        writeFileSync(path, '{ not json');

        expect(new ServerStore(path, now).servers()).toEqual([]);
    });
});

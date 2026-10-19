import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileLogger } from './logger';

let folder = '';

beforeEach(() => {
    folder = mkdtempSync(join(tmpdir(), 'vora-log-'));
});

afterEach(() => {
    rmSync(folder, { recursive: true, force: true });
});

describe('the log file', () => {
    it('gets one line per entry with its level, and the stack of an error', () => {
        const log = new FileLogger(folder, 'vora-desktop.log');

        log.info('Loaded the server', 'https://vora.example.com');
        log.error('The page failed', new Error('net::ERR_CONNECTION_REFUSED'));

        const text = readFileSync(log.path, 'utf8');
        expect(text).toMatch(/INFO Loaded the server https:\/\/vora\.example\.com\n/);
        expect(text).toMatch(/ERROR The page failed Error: net::ERR_CONNECTION_REFUSED/);
    });

    it('rolls over when it is full and keeps only the newest files', () => {
        const log = new FileLogger(folder, 'vora-desktop.log', 200, 3);

        for (let index = 0; index < 40; index++) log.info(`entry ${index}`, 'x'.repeat(40));

        expect(readdirSync(folder).sort()).toEqual(['vora-desktop.log', 'vora-desktop.log.1', 'vora-desktop.log.2']);
        expect(readFileSync(log.path, 'utf8')).toContain('entry 39');
        expect(existsSync(`${log.path}.3`)).toBe(false);
    });
});

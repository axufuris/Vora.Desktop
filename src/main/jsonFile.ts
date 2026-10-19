import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomBytes } from 'node:crypto';
import type { JsonValue } from './values';

export function readJson<T>(path: string, parse: (value: JsonValue) => T, fallback: T): T {
    let text: string;
    try {
        text = readFileSync(path, 'utf8');
    } catch {
        return fallback;
    }
    try {
        const value: JsonValue = JSON.parse(text);
        return parse(value);
    } catch {
        return fallback;
    }
}

export function writeJson(path: string, value: JsonValue): void {
    mkdirSync(dirname(path), { recursive: true });
    const temporary = `${path}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
    try {
        writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
        renameSync(temporary, path);
    } catch (error: unknown) {
        rmSync(temporary, { force: true });
        throw error;
    }
}

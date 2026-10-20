import { appendFileSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

export const LOG_FILE_BYTES = 5 * 1024 * 1024;
export const LOG_FILES = 5;

export type LogLevel = 'info' | 'warn' | 'error';

function errorText(error: unknown): string {
    if (error instanceof Error) return error.stack ?? `${error.name}: ${error.message}`;
    if (typeof error === 'string') return error;
    try {
        return JSON.stringify(error);
    } catch {
        return String(error);
    }
}

export class FileLogger {
    readonly path: string;
    private readonly maxBytes: number;
    private readonly files: number;

    constructor(folder: string, name: string, maxBytes = LOG_FILE_BYTES, files = LOG_FILES) {
        mkdirSync(folder, { recursive: true });
        this.path = join(folder, name);
        this.maxBytes = maxBytes;
        this.files = files;
    }

    info(message: string, detail?: string): void {
        this.write('info', message, detail);
    }

    warn(message: string, error?: unknown): void {
        this.write('warn', message, error === undefined ? undefined : errorText(error));
    }

    error(message: string, error?: unknown): void {
        this.write('error', message, error === undefined ? undefined : errorText(error));
    }

    private write(level: LogLevel, message: string, detail: string | undefined): void {
        const line = `${new Date().toISOString()} ${level.toUpperCase()} ${message}${detail === undefined ? '' : ` ${detail}`}\n`;
        try {
            this.rotateFor(Buffer.byteLength(line));
            appendFileSync(this.path, line, 'utf8');
        } catch (error: unknown) {
            console.error('Could not write the Vora Desktop log', error);
        }
    }

    private rotateFor(bytes: number): void {
        let size: number;
        try {
            size = statSync(this.path).size;
        } catch {
            return;
        }
        if (size + bytes <= this.maxBytes) return;
        rmSync(`${this.path}.${this.files - 1}`, { force: true });
        for (let index = this.files - 2; index >= 1; index--) {
            try {
                renameSync(`${this.path}.${index}`, `${this.path}.${index + 1}`);
            } catch {
                continue;
            }
        }
        renameSync(this.path, `${this.path}.1`);
    }
}

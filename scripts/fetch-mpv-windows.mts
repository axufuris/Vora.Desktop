import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

interface MpvPin {
    version: string;
    file: string;
    url: string;
    sha256: string;
    source: string;
}

function readPin(path: string): MpvPin {
    const value: Record<string, string> = JSON.parse(readFileSync(path, 'utf8'));
    for (const key of ['version', 'file', 'url', 'sha256', 'source']) {
        if (typeof value[key] !== 'string' || value[key].length === 0) throw new Error(`${path} has no ${key}.`);
    }
    return { version: value.version, file: value.file, url: value.url, sha256: value.sha256.toLowerCase(), source: value.source };
}

function extract(archive: string, into: string): void {
    mkdirSync(into, { recursive: true });
    try {
        execFileSync('tar', ['-xf', archive, '-C', into], { stdio: 'ignore' });
    } catch {
        execFileSync('unzip', ['-q', '-o', archive, '-d', into], { stdio: 'ignore' });
    }
}

function filesIn(folder: string): string[] {
    return readdirSync(folder).flatMap(name => {
        const path = join(folder, name);
        return statSync(path).isDirectory() ? filesIn(path) : [path];
    });
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pin = readPin(join(root, 'scripts', 'mpv-windows.json'));
const target = join(root, 'resources', 'mpv');
const marker = join(target, 'vora-mpv-pin.txt');

if (existsSync(marker) && readFileSync(marker, 'utf8').trim() === pin.sha256) {
    console.log(`mpv ${pin.version} is already in resources/mpv.`);
    process.exit(0);
}

console.log(`Downloading mpv ${pin.version} from ${pin.url}`);
const response = await fetch(pin.url);
if (!response.ok) throw new Error(`The download failed: HTTP ${response.status}.`);
const archive = Buffer.from(await response.arrayBuffer());
const digest = createHash('sha256').update(archive).digest('hex');
if (digest !== pin.sha256) throw new Error(`${pin.file} has SHA-256 ${digest}, not the pinned ${pin.sha256}. Nothing was installed.`);

const work = mkdtempSync(join(tmpdir(), 'vora-mpv-'));
try {
    const outer = join(work, pin.file);
    writeFileSync(outer, archive);
    extract(outer, join(work, 'outer'));

    let files = filesIn(join(work, 'outer'));
    const inner = files.find(file => file.toLowerCase().endsWith('.zip'));
    if (!files.some(file => file.toLowerCase().endsWith('mpv.exe')) && inner) {
        extract(inner, join(work, 'inner'));
        files = filesIn(join(work, 'inner'));
    }

    const executable = files.find(file => file.toLowerCase().endsWith('mpv.exe'));
    if (!executable) throw new Error(`${pin.file} has no mpv.exe.`);

    rmSync(target, { recursive: true, force: true });
    cpSync(dirname(executable), target, { recursive: true });
    writeFileSync(marker, `${pin.sha256}\n`, 'utf8');
    console.log(`mpv ${pin.version} is in resources/mpv (source: ${pin.source}).`);
} finally {
    rmSync(work, { recursive: true, force: true });
}

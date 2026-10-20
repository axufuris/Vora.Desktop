import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

interface PinnedFile {
    file: string;
    url: string;
    sha256: string;
}

interface MpvPin extends PinnedFile {
    version: string;
    source: string;
    licences: PinnedFile[];
}

type PinJson = { [key: string]: string | PinJson[] };

function text(value: PinJson, key: string, path: string): string {
    const found = value[key];
    if (typeof found !== 'string' || found.length === 0) throw new Error(`${path} has no ${key}.`);
    return found;
}

function readPin(path: string): MpvPin {
    const value: PinJson = JSON.parse(readFileSync(path, 'utf8'));
    const licences = value.licences;
    if (!Array.isArray(licences) || licences.length === 0) throw new Error(`${path} lists no licences.`);
    return {
        version: text(value, 'version', path),
        file: text(value, 'file', path),
        url: text(value, 'url', path),
        sha256: text(value, 'sha256', path).toLowerCase(),
        source: text(value, 'source', path),
        licences: licences.map(licence => ({ file: text(licence, 'file', path), url: text(licence, 'url', path), sha256: text(licence, 'sha256', path).toLowerCase() })),
    };
}

async function download(pinned: PinnedFile): Promise<Buffer> {
    const response = await fetch(pinned.url);
    if (!response.ok) throw new Error(`Downloading ${pinned.url} failed: HTTP ${response.status}.`);
    const data = Buffer.from(await response.arrayBuffer());
    const digest = createHash('sha256').update(data).digest('hex');
    if (digest !== pinned.sha256) throw new Error(`${pinned.file} has SHA-256 ${digest}, not the pinned ${pinned.sha256}. Nothing was installed.`);
    return data;
}

function extract(archive: string, into: string): void {
    mkdirSync(into, { recursive: true });
    const tar = process.platform === 'win32' ? join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar';
    try {
        execFileSync(tar, ['-xf', archive, '-C', into], { stdio: 'ignore' });
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
const fingerprint = [pin.sha256, ...pin.licences.map(licence => licence.sha256)].join('\n');

if (existsSync(marker) && readFileSync(marker, 'utf8').trim() === fingerprint) {
    console.log(`mpv ${pin.version} is already in resources/mpv.`);
    process.exit(0);
}

console.log(`Downloading mpv ${pin.version} from ${pin.url}`);
const archive = await download(pin);
const licences = await Promise.all(pin.licences.map(async licence => ({ file: licence.file, data: await download(licence) })));

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
    for (const licence of licences) writeFileSync(join(target, licence.file), licence.data);
    writeFileSync(marker, `${fingerprint}\n`, 'utf8');
    console.log(`mpv ${pin.version} is in resources/mpv (source: ${pin.source}).`);
} finally {
    rmSync(work, { recursive: true, force: true });
}

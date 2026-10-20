import { execFile } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import type { DesktopPlatform, MpvStatus } from '../shared/bridge';

export const MINIMUM_MPV = { major: 0, minor: 37 };

const RUN_TIMEOUT_MS = 10_000;
const LUA_MARKER = 'vora-lua-ok';
const LUA_PROBE = `mp.msg.info("${LUA_MARKER}")\nmp.commandv("quit")\n`;

export interface MpvVersion {
    major: number;
    minor: number;
    patch: number;
    label: string;
}

export interface MpvBinary {
    path: string;
    version: MpvVersion;
    videoDecoders: ReadonlySet<string>;
    audioDecoders: ReadonlySet<string>;
}

export interface MpvDiscovery {
    status: MpvStatus;
    binary: MpvBinary | null;
}

export type Runner = (file: string, args: readonly string[]) => Promise<string | null>;

export interface DiscoveryOptions {
    platform: DesktopPlatform;
    bundledFolder: string;
    pathVariable: string | undefined;
    probeFolder: string;
    osRelease: string | null;
    run?: Runner;
}

export function parseMpvVersion(output: string): MpvVersion | null {
    const match = /^mpv v?((\d+)\.(\d+)(?:\.(\d+))?\S*)/m.exec(output);
    if (!match) return null;
    return { major: Number(match[2]), minor: Number(match[3]), patch: Number(match[4] ?? 0), label: match[1] };
}

export function meetsMinimum(version: MpvVersion): boolean {
    return version.major > MINIMUM_MPV.major || (version.major === MINIMUM_MPV.major && version.minor >= MINIMUM_MPV.minor);
}

export function decodersFrom(output: string): Set<string> {
    const codecs = new Set<string>();
    for (const line of output.split(/\r?\n/)) {
        const match = /^\s+(\S+)(?:\s+\(([^)]+)\))?\s+-\s/.exec(line);
        if (match) codecs.add((match[2] ?? match[1]).toLowerCase());
    }
    return codecs;
}

function osReleaseValue(osRelease: string, key: string): string[] {
    const match = new RegExp(`^${key}=(.*)$`, 'm').exec(osRelease);
    if (!match) return [];
    return match[1].replace(/^["']|["']$/g, '').toLowerCase().split(/\s+/).filter(Boolean);
}

export function installCommand(osRelease: string | null): string | null {
    if (!osRelease) return null;
    const families = [...osReleaseValue(osRelease, 'ID'), ...osReleaseValue(osRelease, 'ID_LIKE')];
    if (families.some(id => id === 'debian' || id === 'ubuntu')) return 'sudo apt install mpv';
    if (families.some(id => id === 'fedora' || id === 'rhel')) return 'sudo dnf install mpv';
    if (families.some(id => id === 'arch')) return 'sudo pacman -S mpv';
    if (families.some(id => id.startsWith('opensuse') || id === 'suse')) return 'sudo zypper install mpv';
    return null;
}

export function missingReason(platform: DesktopPlatform, osRelease: string | null): string {
    if (platform === 'windows') return 'The Vora player is missing from this installation. Reinstall Vora Desktop to get it back.';
    const command = installCommand(osRelease);
    return `The Vora player needs mpv, which isn't installed. ${command ? `Install it with ${command}.` : 'Install mpv from your distribution.'}`;
}

export function tooOldReason(version: MpvVersion, osRelease: string | null): string {
    const needed = `${MINIMUM_MPV.major}.${MINIMUM_MPV.minor}`;
    const command = installCommand(osRelease);
    const update = command ? `Update it with ${command}, or install a newer mpv from your distribution.` : 'Install a newer mpv from your distribution.';
    return `This computer has mpv ${version.label}, and the Vora player needs ${needed} or newer. ${update}`;
}

export const NO_LUA_REASON = 'This mpv was built without Lua, which the Vora player needs. Install mpv from your distribution.';

export const NO_GPU_NEXT_REASON = 'This mpv has no gpu-next video output, which the Vora player needs. Install a newer mpv from your distribution.';

export function candidatePaths(platform: DesktopPlatform, bundledFolder: string, pathVariable: string | undefined): string[] {
    if (platform === 'windows') return [join(bundledFolder, 'mpv.exe')];
    const fromPath = (pathVariable ?? '').split(delimiter).filter(Boolean).map(folder => join(folder, 'mpv'));
    return [...new Set([...fromPath, '/usr/bin/mpv', '/usr/local/bin/mpv'])];
}

export const runProcess: Runner = (file, args) => new Promise(resolve => {
    execFile(file, [...args], { timeout: RUN_TIMEOUT_MS, windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (error, stdout, stderr) => {
        const output = `${stdout}${stderr}`;
        if (error && 'code' in error && (error.code === 'ENOENT' || error.code === 'EACCES')) resolve(null);
        else resolve(output);
    });
});

function unavailable(reason: string): MpvDiscovery {
    return { status: { available: false, version: null, reason }, binary: null };
}

export async function discoverMpv(options: DiscoveryOptions): Promise<MpvDiscovery> {
    const run = options.run ?? runProcess;
    for (const candidate of candidatePaths(options.platform, options.bundledFolder, options.pathVariable)) {
        const versionOutput = await run(candidate, ['--no-config', '--version']);
        const version = versionOutput === null ? null : parseMpvVersion(versionOutput);
        if (!version) continue;
        if (!meetsMinimum(version)) return unavailable(tooOldReason(version, options.osRelease));

        mkdirSync(options.probeFolder, { recursive: true });
        const probe = join(options.probeFolder, 'lua-probe.lua');
        writeFileSync(probe, LUA_PROBE, 'utf8');

        const [outputs, videoDecoders, audioDecoders, lua] = await Promise.all([
            run(candidate, ['--no-config', '--vo=help']),
            run(candidate, ['--no-config', '--vd=help']),
            run(candidate, ['--no-config', '--ad=help']),
            run(candidate, ['--no-config', '--idle=yes', '--vo=null', '--ao=null', '--msg-level=all=info', `--script=${probe}`]),
        ]);
        if (!lua?.includes(LUA_MARKER)) return unavailable(NO_LUA_REASON);
        if (!outputs || !/^\s+gpu-next\s/m.test(outputs)) return unavailable(NO_GPU_NEXT_REASON);

        return {
            status: { available: true, version: version.label, reason: null },
            binary: {
                path: candidate,
                version,
                videoDecoders: decodersFrom(videoDecoders ?? ''),
                audioDecoders: decodersFrom(audioDecoders ?? ''),
            },
        };
    }
    return unavailable(missingReason(options.platform, options.osRelease));
}

export function readOsRelease(platform: DesktopPlatform): string | null {
    if (platform !== 'linux') return null;
    for (const file of ['/etc/os-release', '/usr/lib/os-release']) {
        try {
            return readFileSync(file, 'utf8');
        } catch {
            continue;
        }
    }
    return null;
}

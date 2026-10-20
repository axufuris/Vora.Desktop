import type { DesktopChannel, DesktopPlatform, MpvStatus } from './bridge';

export interface SavedServer {
    id: string;
    url: string;
    name: string;
    lastUsedAt: string;
}

export type ProbeResult =
    | { kind: 'ok'; url: string; name: string }
    | { kind: 'invalid'; message: string }
    | { kind: 'untrusted'; url: string; host: string; fingerprint: string; changed: boolean }
    | { kind: 'unreachable'; url: string; message: string }
    | { kind: 'not-vora'; url: string };

export interface VoraShellApi {
    shellVersion: string;
    channel: DesktopChannel;
    servers(): Promise<SavedServer[]>;
    probe(input: string): Promise<ProbeResult>;
    trust(url: string, fingerprint: string): Promise<ProbeResult>;
    connect(url: string): Promise<ProbeResult>;
    open(id: string): Promise<void>;
    forget(id: string): Promise<SavedServer[]>;
    retry(): void;
    switchServer(): void;
}

export type PageInit =
    | { kind: 'server'; bridgeVersion: number; shellVersion: string; channel: DesktopChannel; platform: DesktopPlatform; mpv: MpvStatus }
    | { kind: 'shell'; shellVersion: string; channel: DesktopChannel }
    | { kind: 'none' };

export type LoadFailure =
    | { kind: 'unreachable'; url: string; message: string }
    | { kind: 'untrusted'; url: string; host: string; fingerprint: string; changed: boolean };

export const Ipc = {
    pageInit: 'vora:page-init',
    capabilities: 'vora:capabilities',
    settingsGet: 'vora:settings-get',
    settingsSet: 'vora:settings-set',
    settingsOpenAdvanced: 'vora:settings-open-advanced',
    playerOpen: 'vora:player-open',
    playerCommand: 'vora:player-command',
    playerChromeState: 'vora:player-chrome-state',
    playerScrubSprite: 'vora:player-scrub-sprite',
    playerClose: 'vora:player-close',
    playerEvent: 'vora:player-event',
    mpvChanged: 'vora:mpv-changed',
    switchServer: 'vora:switch-server',
    shellServers: 'vora:shell-servers',
    shellProbe: 'vora:shell-probe',
    shellTrust: 'vora:shell-trust',
    shellConnect: 'vora:shell-connect',
    shellOpen: 'vora:shell-open',
    shellForget: 'vora:shell-forget',
    shellRetry: 'vora:shell-retry',
} as const;

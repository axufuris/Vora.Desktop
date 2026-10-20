import { createHash } from 'node:crypto';
import { readJson, writeJson } from './jsonFile';
import type { JsonValue } from './values';
import { isRecord } from './values';

export type CertificateVerdict = 'accept' | 'reject';

export function fingerprintOf(pem: string): string {
    const body = pem.replace(/-----(BEGIN|END) CERTIFICATE-----/g, '').replace(/\s+/g, '');
    const digest = createHash('sha256').update(Buffer.from(body, 'base64')).digest('hex').toUpperCase();
    return digest.match(/.{2}/g)?.join(':') ?? digest;
}

type Pins = Record<string, string>;

function pinsFrom(value: JsonValue): Pins {
    if (!isRecord(value) || !isRecord(value.pins)) return {};
    const pins: Pins = {};
    for (const [host, fingerprint] of Object.entries(value.pins)) {
        if (typeof fingerprint === 'string') pins[host.toLowerCase()] = fingerprint;
    }
    return pins;
}

export class CertTrust {
    private readonly path: string;
    private pins: Pins;
    private readonly untrusted = new Map<string, string>();

    constructor(path: string) {
        this.path = path;
        this.pins = readJson(path, pinsFrom, {});
    }

    verdict(hostname: string, fingerprint: string, serverHosts: ReadonlySet<string>): CertificateVerdict {
        const host = hostname.toLowerCase();
        if (!serverHosts.has(host)) return 'reject';
        if (this.pins[host] === fingerprint) return 'accept';
        this.untrusted.set(host, fingerprint);
        return 'reject';
    }

    pinnedFingerprint(hostname: string): string | null {
        return this.pins[hostname.toLowerCase()] ?? null;
    }

    lastUntrusted(hostname: string): string | null {
        return this.untrusted.get(hostname.toLowerCase()) ?? null;
    }

    trust(hostname: string, fingerprint: string): boolean {
        const host = hostname.toLowerCase();
        if (this.untrusted.get(host) !== fingerprint) return false;
        this.pins = { ...this.pins, [host]: fingerprint };
        this.untrusted.delete(host);
        writeJson(this.path, { pins: this.pins });
        return true;
    }
}

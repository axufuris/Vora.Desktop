import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { CertTrust, fingerprintOf } from './certTrust';

const der = Buffer.from('a certificate body for the test');
const pem = `-----BEGIN CERTIFICATE-----\n${der.toString('base64').replace(/(.{20})/g, '$1\n')}\n-----END CERTIFICATE-----\n`;
const fingerprint = fingerprintOf(pem);
const otherFingerprint = fingerprintOf(`-----BEGIN CERTIFICATE-----\n${Buffer.from('another').toString('base64')}\n-----END CERTIFICATE-----`);
const servers = new Set(['nas.local']);

let folder = '';

beforeEach(() => {
    folder = mkdtempSync(join(tmpdir(), 'vora-cert-'));
});

afterEach(() => {
    rmSync(folder, { recursive: true, force: true });
});

describe('a certificate fingerprint', () => {
    it('is the SHA-256 of the certificate as colon-separated hex', () => {
        const expected = createHash('sha256').update(der).digest('hex').toUpperCase().match(/.{2}/g)?.join(':');

        expect(fingerprint).toBe(expected);
        expect(fingerprint).toMatch(/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
    });
});

describe('trusting a home server certificate', () => {
    it('never accepts a bad certificate for a host that is not a Vora server', () => {
        const trust = new CertTrust(join(folder, 'certTrust.json'));
        trust.verdict('nas.local', fingerprint, servers);
        trust.trust('nas.local', fingerprint);

        expect(trust.verdict('evil.example.com', fingerprint, servers)).toBe('reject');
    });

    it('remembers the certificate it refused, so the page can show its fingerprint', () => {
        const trust = new CertTrust(join(folder, 'certTrust.json'));

        expect(trust.verdict('NAS.local', fingerprint, servers)).toBe('reject');
        expect(trust.lastUntrusted('nas.local')).toBe(fingerprint);
    });

    it('accepts the trusted fingerprint from then on, also after a restart', () => {
        const path = join(folder, 'certTrust.json');
        const trust = new CertTrust(path);
        trust.verdict('nas.local', fingerprint, servers);

        expect(trust.trust('nas.local', fingerprint)).toBe(true);
        expect(new CertTrust(path).verdict('nas.local', fingerprint, servers)).toBe('accept');
    });

    it('asks again when the certificate changes', () => {
        const trust = new CertTrust(join(folder, 'certTrust.json'));
        trust.verdict('nas.local', fingerprint, servers);
        trust.trust('nas.local', fingerprint);

        expect(trust.verdict('nas.local', otherFingerprint, servers)).toBe('reject');
        expect(trust.pinnedFingerprint('nas.local')).toBe(fingerprint);
        expect(trust.lastUntrusted('nas.local')).toBe(otherFingerprint);
    });

    it('only trusts the fingerprint the server actually presented', () => {
        const trust = new CertTrust(join(folder, 'certTrust.json'));
        trust.verdict('nas.local', fingerprint, servers);

        expect(trust.trust('nas.local', otherFingerprint)).toBe(false);
        expect(trust.verdict('nas.local', otherFingerprint, servers)).toBe('reject');
    });
});

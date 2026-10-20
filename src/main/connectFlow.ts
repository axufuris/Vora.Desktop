import type { ProbeResult, SavedServer } from '../shared/shell';
import type { CertTrust } from './certTrust';
import { hostOf, normaliseServerUrl, probeServer, type Fetcher } from './serverProbe';
import type { ServerStore } from './serverStore';

export const INVALID_ADDRESS = 'Enter the address of your Vora server, like vora.example.com or 192.168.1.20:5000.';

export const INVALID_CERTIFICATE = "The server's certificate isn't valid for this address.";

export interface ConnectTarget {
    setPendingHost(host: string | null): void;
    showServer(server: SavedServer): void;
}

export interface ConnectFlowOptions {
    fetcher: Fetcher;
    trust: CertTrust;
    servers: ServerStore;
    target: ConnectTarget;
    certificatesChanged: () => Promise<void>;
}

export class ConnectFlow {
    private readonly options: ConnectFlowOptions;

    constructor(options: ConnectFlowOptions) {
        this.options = options;
    }

    probe(input: string): Promise<ProbeResult> {
        const url = normaliseServerUrl(input);
        return url ? this.probeUrl(url) : Promise.resolve({ kind: 'invalid', message: INVALID_ADDRESS });
    }

    async trustCertificate(input: string, fingerprint: string): Promise<ProbeResult> {
        const url = normaliseServerUrl(input);
        if (!url) return { kind: 'invalid', message: INVALID_ADDRESS };
        if (this.options.trust.trust(hostOf(url), fingerprint)) await this.options.certificatesChanged();
        return this.probeUrl(url);
    }

    async connect(input: string): Promise<ProbeResult> {
        const result = await this.probe(input);
        if (result.kind === 'ok') this.options.target.showServer(this.options.servers.use(result.url, result.name));
        return result;
    }

    private async probeUrl(url: string): Promise<ProbeResult> {
        const host = hostOf(url);
        this.options.target.setPendingHost(host);
        const outcome = await probeServer(url, this.options.fetcher);
        if (outcome.kind === 'ok') return { kind: 'ok', url, name: outcome.name };
        if (outcome.kind === 'not-vora') return { kind: 'not-vora', url };
        if (!outcome.message.includes('ERR_CERT_')) return { kind: 'unreachable', url, message: outcome.message };
        const fingerprint = this.options.trust.lastUntrusted(host);
        return fingerprint
            ? { kind: 'untrusted', url, host, fingerprint, changed: this.options.trust.pinnedFingerprint(host) !== null }
            : { kind: 'unreachable', url, message: INVALID_CERTIFICATE };
    }
}

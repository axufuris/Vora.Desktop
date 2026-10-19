import type { VoraShellApi } from '../shared/shell';

declare global {
    interface Window {
        voraShell?: VoraShellApi;
    }
}

export {};

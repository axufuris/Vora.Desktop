import type { VoraShellApi } from '../shared/shell';
import { problemText, trustText, versionLine } from './pageText';

function element<T extends HTMLElement>(id: string, type: { new(): T }): T {
    const found = document.getElementById(id);
    if (!(found instanceof type)) throw new Error(`The error page is missing #${id}`);
    return found;
}

function start(shell: VoraShellApi): void {
    const query = new URLSearchParams(window.location.search);
    const url = query.get('url') ?? '';
    const name = query.get('name') || url || 'Your Vora server';

    const title = element('title', HTMLHeadingElement);
    const message = element('message', HTMLParagraphElement);
    const address = element('address', HTMLSpanElement);
    const trust = element('trust', HTMLElement);
    const fingerprint = element('fingerprint', HTMLElement);
    const status = element('status', HTMLParagraphElement);
    const primary = element('primary', HTMLButtonElement);
    const switchServer = element('switch', HTMLButtonElement);

    element('version', HTMLElement).textContent = versionLine(shell.shellVersion, shell.channel);
    address.textContent = url;
    switchServer.addEventListener('click', () => shell.switchServer());

    const presented = query.get('fingerprint');
    if (query.get('kind') === 'untrusted' && presented) {
        const words = trustText(query.get('changed') === 'true', name);
        title.textContent = words.title;
        message.textContent = words.text;
        fingerprint.textContent = presented;
        trust.hidden = false;
        primary.textContent = 'Trust this certificate';
        primary.addEventListener('click', () => {
            primary.disabled = true;
            status.textContent = 'Checking the server again…';
            shell.trust(url, presented)
                .then(result => {
                    if (result.kind === 'ok') {
                        shell.retry();
                        return;
                    }
                    primary.disabled = false;
                    status.textContent = result.kind === 'untrusted' ? 'The server presented a different certificate. Try again.' : problemText(result);
                })
                .catch((error: unknown) => {
                    primary.disabled = false;
                    status.textContent = error instanceof Error ? error.message : 'Something went wrong.';
                });
        });
        switchServer.focus();
        return;
    }

    title.textContent = `Can't reach ${name}`;
    message.textContent = query.get('message') || 'The server could not be reached.';
    primary.textContent = 'Try again';
    primary.addEventListener('click', () => {
        primary.disabled = true;
        status.textContent = 'Trying again…';
        shell.retry();
    });
    primary.focus();
}

const shell = window.voraShell;
if (shell) start(shell);
else document.body.textContent = 'This page only works inside Vora Desktop.';

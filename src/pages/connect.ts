import type { ProbeResult, SavedServer, VoraShellApi } from '../shared/shell';
import { problemText, trustText, versionLine } from './pageText';

function element<T extends HTMLElement>(id: string, type: { new(): T }): T {
    const found = document.getElementById(id);
    if (!(found instanceof type)) throw new Error(`The connect page is missing #${id}`);
    return found;
}

function start(shell: VoraShellApi): void {
    const form = element('connect-form', HTMLFormElement);
    const address = element('address', HTMLInputElement);
    const find = element('find', HTMLButtonElement);
    const status = element('status', HTMLParagraphElement);
    const saved = element('saved', HTMLElement);
    const savedList = element('saved-list', HTMLUListElement);
    const found = element('found', HTMLElement);
    const foundName = element('found-name', HTMLParagraphElement);
    const foundUrl = element('found-url', HTMLSpanElement);
    const connect = element('connect', HTMLButtonElement);
    const trust = element('trust', HTMLElement);
    const trustTitle = element('trust-title', HTMLHeadingElement);
    const trustBody = element('trust-text', HTMLParagraphElement);
    const fingerprint = element('fingerprint', HTMLElement);
    const trustAccept = element('trust-accept', HTMLButtonElement);
    const trustCancel = element('trust-cancel', HTMLButtonElement);

    element('version', HTMLElement).textContent = versionLine(shell.shellVersion, shell.channel);

    let pending: ProbeResult | null = null;

    const setStatus = (text: string, isError = false) => {
        status.textContent = text;
        status.classList.toggle('error', isError);
    };

    const setBusy = (busy: boolean) => {
        for (const control of [address, find, connect, trustAccept, trustCancel]) control.disabled = busy;
    };

    const show = (result: ProbeResult) => {
        pending = result;
        found.hidden = result.kind !== 'ok';
        trust.hidden = result.kind !== 'untrusted';
        switch (result.kind) {
            case 'ok':
                setStatus('');
                foundName.textContent = result.name;
                foundUrl.textContent = result.url;
                connect.textContent = `Connect to ${result.name}`;
                connect.focus();
                return;
            case 'untrusted': {
                setStatus('');
                const words = trustText(result.changed, result.host);
                trustTitle.textContent = words.title;
                trustBody.textContent = words.text;
                fingerprint.textContent = result.fingerprint;
                trustCancel.focus();
                return;
            }
            default:
                setStatus(problemText(result), true);
                address.focus();
        }
    };

    const run = async (work: () => Promise<ProbeResult>, busyText: string) => {
        setBusy(true);
        setStatus(busyText);
        try {
            show(await work());
        } catch (error: unknown) {
            setStatus(error instanceof Error ? error.message : 'Something went wrong.', true);
        } finally {
            setBusy(false);
        }
    };

    const renderSaved = (servers: SavedServer[]) => {
        saved.hidden = servers.length === 0;
        savedList.replaceChildren(...servers.map(server => {
            const item = document.createElement('li');
            const open = document.createElement('button');
            open.type = 'button';
            open.className = 'server';
            const name = document.createElement('span');
            name.textContent = server.name;
            const url = document.createElement('span');
            url.className = 'server-url';
            url.textContent = server.url;
            open.append(name, url);
            open.addEventListener('click', () => {
                setStatus(`Opening ${server.name}…`);
                shell.open(server.id).catch((error: unknown) => setStatus(error instanceof Error ? error.message : 'That server could not be opened.', true));
            });
            const forget = document.createElement('button');
            forget.type = 'button';
            forget.className = 'secondary';
            forget.textContent = 'Forget';
            forget.setAttribute('aria-label', `Forget ${server.name}`);
            forget.addEventListener('click', () => {
                shell.forget(server.id).then(renderSaved).catch((error: unknown) => setStatus(error instanceof Error ? error.message : 'That server could not be forgotten.', true));
            });
            item.append(open, forget);
            return item;
        }));
    };

    form.addEventListener('submit', event => {
        event.preventDefault();
        void run(() => shell.probe(address.value), 'Looking for the server…');
    });

    connect.addEventListener('click', () => {
        if (pending?.kind !== 'ok') return;
        const url = pending.url;
        void run(() => shell.connect(url), `Connecting to ${pending.name}…`);
    });

    trustAccept.addEventListener('click', () => {
        if (pending?.kind !== 'untrusted') return;
        const { url, fingerprint: presented } = pending;
        void run(() => shell.trust(url, presented), 'Checking the server again…');
    });

    trustCancel.addEventListener('click', () => {
        pending = null;
        trust.hidden = true;
        address.focus();
    });

    shell.servers().then(renderSaved).catch(() => renderSaved([]));
    address.focus();
}

const shell = window.voraShell;
if (shell) start(shell);
else document.body.textContent = 'This page only works inside Vora Desktop.';

import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { MpvStatus, PlayerEvent, VoraDesktopBridge } from '../shared/bridge';
import { Ipc, type PageInit, type VoraShellApi } from '../shared/shell';

function subscribe<T>(channel: string, handler: (payload: T) => void): () => void {
    const listener = (_event: IpcRendererEvent, payload: T) => handler(payload);
    ipcRenderer.on(channel, listener);
    return () => { ipcRenderer.removeListener(channel, listener); };
}

function desktopBridge(init: Extract<PageInit, { kind: 'server' }>): VoraDesktopBridge {
    return {
        bridgeVersion: init.bridgeVersion,
        shellVersion: init.shellVersion,
        channel: init.channel,
        platform: init.platform,
        mpv: init.mpv,
        onMpvChanged: handler => subscribe<MpvStatus>(Ipc.mpvChanged, handler),
        capabilities: () => ipcRenderer.invoke(Ipc.capabilities),
        player: {
            open: request => ipcRenderer.invoke(Ipc.playerOpen, request),
            command: command => ipcRenderer.send(Ipc.playerCommand, command),
            setChromeState: state => ipcRenderer.send(Ipc.playerChromeState, state),
            setScrubSprite: spec => ipcRenderer.invoke(Ipc.playerScrubSprite, spec),
            close: () => ipcRenderer.invoke(Ipc.playerClose),
            onEvent: handler => subscribe<PlayerEvent>(Ipc.playerEvent, handler),
        },
        settings: {
            get: () => ipcRenderer.invoke(Ipc.settingsGet),
            set: patch => ipcRenderer.invoke(Ipc.settingsSet, patch),
            openAdvancedFolder: () => ipcRenderer.invoke(Ipc.settingsOpenAdvanced),
        },
        servers: {
            switchServer: () => ipcRenderer.send(Ipc.switchServer),
        },
    };
}

function shellApi(init: Extract<PageInit, { kind: 'shell' }>): VoraShellApi {
    return {
        shellVersion: init.shellVersion,
        channel: init.channel,
        servers: () => ipcRenderer.invoke(Ipc.shellServers),
        probe: input => ipcRenderer.invoke(Ipc.shellProbe, input),
        trust: (url, fingerprint) => ipcRenderer.invoke(Ipc.shellTrust, url, fingerprint),
        connect: url => ipcRenderer.invoke(Ipc.shellConnect, url),
        open: id => ipcRenderer.invoke(Ipc.shellOpen, id),
        forget: id => ipcRenderer.invoke(Ipc.shellForget, id),
        retry: () => ipcRenderer.send(Ipc.shellRetry),
        switchServer: () => ipcRenderer.send(Ipc.switchServer),
    };
}

const init: PageInit = ipcRenderer.sendSync(Ipc.pageInit);

if (init.kind === 'server') contextBridge.exposeInMainWorld('voraDesktop', desktopBridge(init));
else if (init.kind === 'shell') contextBridge.exposeInMainWorld('voraShell', shellApi(init));

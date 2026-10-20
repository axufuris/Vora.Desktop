import { Menu, type MenuItemConstructorOptions } from 'electron';

export interface MenuActions {
    switchServer(): void;
    reload(): void;
    toggleFullScreen(): void;
    about(): void;
    devTools: boolean;
    updateReady: string | null;
    restartToUpdate(): void;
}

export function buildMenu(actions: MenuActions): Menu {
    const template: MenuItemConstructorOptions[] = [
        {
            label: '&Vora',
            submenu: [
                { label: 'Switch server', click: () => actions.switchServer() },
                { label: 'Reload', accelerator: 'CmdOrCtrl+R', click: () => actions.reload() },
                { label: 'Toggle full screen', accelerator: 'F11', click: () => actions.toggleFullScreen() },
                { type: 'separator' },
                { label: 'About Vora Desktop', click: () => actions.about() },
                ...(actions.updateReady ? [{ label: `Restart to update to ${actions.updateReady}`, click: () => actions.restartToUpdate() }] : []),
                { type: 'separator' },
                { role: 'quit' },
            ],
        },
    ];
    if (actions.devTools) {
        template.push({ label: '&Developer', submenu: [{ role: 'toggleDevTools' }] });
    }
    return Menu.buildFromTemplate(template);
}

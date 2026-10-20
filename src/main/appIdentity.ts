import type { DesktopChannel } from '../shared/bridge';

export interface AppIdentity {
    appId: string;
    productName: string;
    executableName: string;
    icon: string;
    toastActivator: string;
}

const IDENTITIES: Record<DesktopChannel, AppIdentity> = {
    prod: {
        appId: 'net.getvora.desktop',
        productName: 'Vora',
        executableName: 'vora-desktop',
        icon: 'resources/icons/vora-512.png',
        toastActivator: '{1DC69B83-98DB-4607-9486-15E9D1FAC089}',
    },
    qa: {
        appId: 'net.getvora.desktop.qa',
        productName: 'Vora QA',
        executableName: 'vora-desktop-qa',
        icon: 'resources/icons/qa/vora-512.png',
        toastActivator: '{4E12818C-28DA-4DB5-B1E7-FFAF453EA876}',
    },
};

export function appIdentity(channel: DesktopChannel): AppIdentity {
    return IDENTITIES[channel];
}

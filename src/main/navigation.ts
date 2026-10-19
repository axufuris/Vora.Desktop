export interface PageLocations {
    devPagesOrigin: string | null;
    pagesFolderUrl: string;
}

export type NavigationVerdict = 'allow' | 'external' | 'block';

export type PageAccess = 'server' | 'shell' | 'none';

function parse(url: string): URL | null {
    try {
        return new URL(url);
    } catch {
        return null;
    }
}

export function isShellPage(url: string, pages: PageLocations): boolean {
    const parsed = parse(url);
    if (!parsed) return false;
    if (pages.devPagesOrigin && parsed.origin === pages.devPagesOrigin) return true;
    if (parsed.protocol !== 'file:') return false;
    const folder = pages.pagesFolderUrl.endsWith('/') ? pages.pagesFolderUrl : `${pages.pagesFolderUrl}/`;
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`.toLowerCase().startsWith(folder.toLowerCase());
}

export function isServerPage(url: string, serverOrigin: string | null): boolean {
    const parsed = parse(url);
    return !!parsed && !!serverOrigin && (parsed.protocol === 'https:' || parsed.protocol === 'http:') && parsed.origin === serverOrigin;
}

export function pageAccess(frameUrl: string, serverOrigin: string | null, pages: PageLocations): PageAccess {
    if (isServerPage(frameUrl, serverOrigin)) return 'server';
    if (isShellPage(frameUrl, pages)) return 'shell';
    return 'none';
}

export function navigationVerdict(target: string, serverOrigin: string | null, pages: PageLocations): NavigationVerdict {
    if (isServerPage(target, serverOrigin) || isShellPage(target, pages)) return 'allow';
    return parse(target)?.protocol === 'https:' ? 'external' : 'block';
}

export function popupVerdict(target: string): 'external' | 'block' {
    return parse(target)?.protocol === 'https:' ? 'external' : 'block';
}

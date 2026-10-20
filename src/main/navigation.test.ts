import { describe, expect, it } from 'vitest';
import { navigationVerdict, pageAccess, popupVerdict, type PageLocations } from './navigation';

const packaged: PageLocations = { devPagesOrigin: null, pagesFolderUrl: 'file:///C:/Program%20Files/Vora/resources/app.asar/out/renderer' };
const dev: PageLocations = { devPagesOrigin: 'http://localhost:5180', pagesFolderUrl: 'file:///D:/Development/Vora.Desktop/out/renderer' };
const server = 'https://vora.example.com';

describe('what a page may use', () => {
    it('gives the Vora bridge only to the server the app is connected to', () => {
        expect(pageAccess('https://vora.example.com/server/abc/movies', server, packaged)).toBe('server');
        expect(pageAccess('https://evil.example.com/', server, packaged)).toBe('none');
        expect(pageAccess('http://vora.example.com/', server, packaged)).toBe('none');
        expect(pageAccess('https://vora.example.com:8443/', server, packaged)).toBe('none');
        expect(pageAccess('https://vora.example.com/', null, packaged)).toBe('none');
    });

    it('gives the connect page its own API, from the bundled pages only', () => {
        expect(pageAccess('file:///C:/Program%20Files/Vora/resources/app.asar/out/renderer/connect.html', server, packaged)).toBe('shell');
        expect(pageAccess('file:///C:/Users/me/Downloads/connect.html', server, packaged)).toBe('none');
        expect(pageAccess('http://localhost:5180/connect.html', server, dev)).toBe('shell');
        expect(pageAccess('http://localhost:5180/connect.html', server, packaged)).toBe('none');
    });
});

describe('where the window may go', () => {
    it('stays on the server and the bundled pages', () => {
        expect(navigationVerdict('https://vora.example.com/login', server, packaged)).toBe('allow');
        expect(navigationVerdict('file:///C:/Program%20Files/Vora/resources/app.asar/out/renderer/error.html?kind=unreachable', server, packaged)).toBe('allow');
    });

    it('opens other https sites in the browser and blocks anything else', () => {
        expect(navigationVerdict('https://www.themoviedb.org/movie/603', server, packaged)).toBe('external');
        expect(navigationVerdict('http://tracker.example.com/', server, packaged)).toBe('block');
        expect(navigationVerdict('file:///C:/Windows/System32/', server, packaged)).toBe('block');
        expect(navigationVerdict('javascript:alert(1)', server, packaged)).toBe('block');
    });

    it('never opens a new window from a page: https goes to the browser', () => {
        expect(popupVerdict('https://www.imdb.com/title/tt0133093/')).toBe('external');
        expect(popupVerdict('https://vora.example.com/admin')).toBe('external');
        expect(popupVerdict('file:///C:/')).toBe('block');
    });
});

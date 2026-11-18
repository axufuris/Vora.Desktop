import { describe, expect, it } from 'vitest';
import { browserAddressFrom } from './externalLinks';

const server = 'https://vora.example.com';

describe('which addresses the server page may open in the browser', () => {
    it('opens a page on the connected server', () => {
        expect(browserAddressFrom('https://vora.example.com/link?code=BCDFGHJK', server)).toBe('https://vora.example.com/link?code=BCDFGHJK');
        expect(browserAddressFrom('https://vora.example.com', server)).toBe('https://vora.example.com/');
    });

    it('opens a page on a server reached over plain http, which the pairing address then is', () => {
        expect(browserAddressFrom('http://192.168.0.10:8080/link?code=BCDFGHJK', 'http://192.168.0.10:8080')).toBe('http://192.168.0.10:8080/link?code=BCDFGHJK');
        expect(browserAddressFrom('http://192.168.0.10:8080/api/auth/oidc/authentik/start?invite=t', 'http://192.168.0.10:8080')).toBe('http://192.168.0.10:8080/api/auth/oidc/authentik/start?invite=t');
    });

    it('opens an https address anywhere, such as the sign-in address of an identity provider', () => {
        expect(browserAddressFrom('https://accounts.example.com/o/oauth2/v2/auth?client_id=abc&state=s', server)).toBe('https://accounts.example.com/o/oauth2/v2/auth?client_id=abc&state=s');
        expect(browserAddressFrom('https://auth.example.com:9443/application/o/authorize/', 'http://192.168.0.10:8080')).toBe('https://auth.example.com:9443/application/o/authorize/');
    });

    it('refuses an http address that is not the connected server, and another scheme of the same host', () => {
        expect(browserAddressFrom('http://evil.example.com/link', server)).toBeNull();
        expect(browserAddressFrom('http://vora.example.com/link', server)).toBeNull();
        expect(browserAddressFrom('http://vora.example.com:8080/link', server)).toBeNull();
        expect(browserAddressFrom('http://192.168.0.11:8080/link', 'http://192.168.0.10:8080')).toBeNull();
    });

    it('refuses anything that is not a web address', () => {
        expect(browserAddressFrom('file:///C:/Windows/System32/calc.exe', server)).toBeNull();
        expect(browserAddressFrom('javascript:alert(1)', server)).toBeNull();
        expect(browserAddressFrom('ms-msdt:/id PCWDiagnostic', server)).toBeNull();
        expect(browserAddressFrom('steam://run/1', server)).toBeNull();
        expect(browserAddressFrom('ftp://vora.example.com/file', server)).toBeNull();
        expect(browserAddressFrom('vora.example.com/link', server)).toBeNull();
        expect(browserAddressFrom('', server)).toBeNull();
    });

    it('refuses an address with a sign-in in front of the host', () => {
        expect(browserAddressFrom('https://admin:secret@vora.example.com/link', server)).toBeNull();
        expect(browserAddressFrom('https://vora.example.com@evil.example.com/link', server)).toBeNull();
        expect(browserAddressFrom('https://user@accounts.example.com/auth', server)).toBeNull();
    });

    it('refuses something that is not a string, or is absurdly long', () => {
        expect(browserAddressFrom(undefined, server)).toBeNull();
        expect(browserAddressFrom(null, server)).toBeNull();
        expect(browserAddressFrom(42, server)).toBeNull();
        expect(browserAddressFrom({ url: 'https://vora.example.com/' }, server)).toBeNull();
        expect(browserAddressFrom(`https://vora.example.com/${'a'.repeat(5000)}`, server)).toBeNull();
        expect(browserAddressFrom(`https://accounts.example.com/${'a'.repeat(5000)}`, server)).toBeNull();
    });

    it('refuses everything while no server is connected', () => {
        expect(browserAddressFrom('https://vora.example.com/link', null)).toBeNull();
        expect(browserAddressFrom('https://accounts.example.com/auth', null)).toBeNull();
    });
});

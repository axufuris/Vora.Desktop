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
    });

    it('refuses another site, another port and another scheme of the same host', () => {
        expect(browserAddressFrom('https://evil.example.com/link', server)).toBeNull();
        expect(browserAddressFrom('https://vora.example.com:8443/link', server)).toBeNull();
        expect(browserAddressFrom('http://vora.example.com/link', server)).toBeNull();
        expect(browserAddressFrom('https://vora.example.com.evil.test/link', server)).toBeNull();
    });

    it('refuses anything that is not a web address', () => {
        expect(browserAddressFrom('file:///C:/Windows/System32/calc.exe', server)).toBeNull();
        expect(browserAddressFrom('javascript:alert(1)', server)).toBeNull();
        expect(browserAddressFrom('ms-msdt:/id PCWDiagnostic', server)).toBeNull();
        expect(browserAddressFrom('vora.example.com/link', server)).toBeNull();
        expect(browserAddressFrom('', server)).toBeNull();
    });

    it('refuses an address with a sign-in in front of the host', () => {
        expect(browserAddressFrom('https://admin:secret@vora.example.com/link', server)).toBeNull();
        expect(browserAddressFrom('https://vora.example.com@evil.example.com/link', server)).toBeNull();
    });

    it('refuses something that is not a string, or is absurdly long', () => {
        expect(browserAddressFrom(undefined, server)).toBeNull();
        expect(browserAddressFrom(null, server)).toBeNull();
        expect(browserAddressFrom(42, server)).toBeNull();
        expect(browserAddressFrom({ url: 'https://vora.example.com/' }, server)).toBeNull();
        expect(browserAddressFrom(`https://vora.example.com/${'a'.repeat(5000)}`, server)).toBeNull();
    });

    it('refuses everything while no server is connected', () => {
        expect(browserAddressFrom('https://vora.example.com/link', null)).toBeNull();
    });
});

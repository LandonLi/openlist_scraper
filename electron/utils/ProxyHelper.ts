import { HttpsProxyAgent } from 'https-proxy-agent';

export class ProxyHelper {
    static parseProxyUrl(proxyUrl: string): string | false {
        if (!proxyUrl) return false;
        try {
            // Just validate URL
            new URL(proxyUrl);
            return proxyUrl;
        } catch (e) {
            console.error('Invalid proxy URL:', proxyUrl);
            return false;
        }
    }

    static createAgent(proxyUrl: string): HttpsProxyAgent<string> | undefined {
        if (!proxyUrl) return undefined;
        try {
            return new HttpsProxyAgent(proxyUrl);
        } catch (e) {
            console.error('Failed to create proxy agent:', e);
            return undefined;
        }
    }
}

import fetch, { RequestInit, Request } from 'node-fetch';
import { HttpsProxyAgent } from 'https-proxy-agent';

export interface FetchClientConfig extends RequestInit {
    baseURL?: string;
    params?: Record<string, string | number | boolean | undefined>;
    timeout?: number;
    proxyUrl?: string; // Add convenience proxy support
}

export interface FetchResponse<T = any> {
    data: T;
    status: number;
    statusText: string;
    headers: any;
    config: FetchClientConfig & { url: string };
    request?: Request;
}

export type Interceptor<V> = {
    onFulfilled?: (value: V) => V | Promise<V>;
    onRejected?: (error: any) => any;
};

export class FetchClient {
    public defaults: FetchClientConfig;
    public interceptors = {
        request: {
            handlers: [] as Interceptor<FetchClientConfig>[],
            use(onFulfilled?: (value: FetchClientConfig) => FetchClientConfig | Promise<FetchClientConfig>, onRejected?: (error: any) => any) {
                this.handlers.push({ onFulfilled, onRejected });
                return this.handlers.length - 1;
            }
        },
        response: {
            handlers: [] as Interceptor<FetchResponse>[],
            use(onFulfilled?: (value: FetchResponse) => FetchResponse | Promise<FetchResponse>, onRejected?: (error: any) => any) {
                this.handlers.push({ onFulfilled, onRejected });
                return this.handlers.length - 1;
            }
        }
    };

    constructor(defaults: FetchClientConfig = {}) {
        this.defaults = defaults;
    }

    static create(defaults: FetchClientConfig = {}) {
        return new FetchClient(defaults);
    }

    private async request<T = any>(url: string, config: FetchClientConfig = {}): Promise<FetchResponse<T>> {
        // 1. Merge Config
        let mergedConfig: FetchClientConfig = { ...this.defaults, ...config };
        mergedConfig.params = { ...this.defaults.params, ...config.params };
        mergedConfig.headers = { ...this.defaults.headers, ...config.headers };

        // Set full URL
        let fullUrl = url;
        if (mergedConfig.baseURL && !url.startsWith('http')) {
            // Handle trailing slash in baseURL and leading slash in url
            const base = mergedConfig.baseURL.replace(/\/$/, '');
            const path = url.replace(/^\//, '');
            fullUrl = `${base}/${path}`;
        }

        // Append Params
        if (mergedConfig.params) {
            const u = new URL(fullUrl);
            Object.entries(mergedConfig.params).forEach(([key, value]) => {
                if (value !== undefined) u.searchParams.append(key, String(value));
            });
            fullUrl = u.toString();
        }

        // Explicitly add url to config for interceptors and response
        (mergedConfig as any).url = fullUrl;

        // 2. Request Interceptors
        try {
            for (const handler of this.interceptors.request.handlers) {
                if (handler.onFulfilled) mergedConfig = await handler.onFulfilled(mergedConfig);
            }
        } catch (e) {
            // If request interceptor fails
            return Promise.reject(e);
        }

        // 3. Prepare Fetch Options
        const { timeout, proxyUrl, ...fetchOptions } = mergedConfig;

        // Timeout
        let timer: NodeJS.Timeout | null = null;
        if (timeout) {
            const controller = new AbortController();
            fetchOptions.signal = controller.signal as any; // Type cast for node-fetch compatibility
            timer = setTimeout(() => controller.abort(), timeout);
        }

        // Proxy
        if (proxyUrl) {
            // Only create agent if not already present? 
            // Axios prioritizes request config > defaults. We merged them.
            try {
                (fetchOptions as any).agent = new HttpsProxyAgent(proxyUrl);
            } catch (e) {
                console.warn('Invalid proxy URL in FetchClient:', proxyUrl);
            }
        } else if (this.defaults.proxyUrl && !config.agent) {
            // Fallback to default proxy if not overridden
            try {
                (fetchOptions as any).agent = new HttpsProxyAgent(this.defaults.proxyUrl);
            } catch (e) {
                console.warn('Invalid default proxy URL in FetchClient:', this.defaults.proxyUrl);
            }
        }

        try {
            const response = await fetch(fullUrl, fetchOptions);
            if (timer) clearTimeout(timer);

            // 4. Transform Response
            let data: any;
            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                data = await response.json();
            } else {
                data = await response.text();
            }

            let fetchResponse: FetchResponse<T> = {
                data: data as T,
                status: response.status,
                statusText: response.statusText,
                headers: response.headers,
                config: mergedConfig as FetchClientConfig & { url: string },
                request: undefined // node-fetch doesn't expose underlying request object easily in same way, leaving undefined
            };

            // 5. Response Interceptors (Success)
            for (const handler of this.interceptors.response.handlers) {
                if (handler.onFulfilled) fetchResponse = await handler.onFulfilled(fetchResponse);
            }

            // Check for HTTP errors (Axios throws on non-2xx by default)
            // Note: Interceptors might handle this (e.g. logging), but we should probably throw 
            // if the final status is an error, to mimic axios.
            // Axios logic: validateStatus (default: 2xx).
            if (fetchResponse.status < 200 || fetchResponse.status >= 300) {
                const error: any = new Error(`Request failed with status code ${fetchResponse.status}`);
                error.response = fetchResponse;
                error.config = mergedConfig;
                throw error;
            }

            return fetchResponse;

        } catch (error: any) {
            if (timer) clearTimeout(timer);

            // 5. Response Interceptors (Error)
            let rejectedPromise: Promise<any> = Promise.reject(error);
            for (const handler of this.interceptors.response.handlers) {
                if (handler.onRejected) {
                    try {
                        // If handler returns specific value/promise, we resolve? 
                        // Axios docs: "If you want to skip the error handling, simply do not pass the error handler"
                        // Actually usually onRejected returns a new Promise or throws.
                        const result = await handler.onRejected(error);
                        // If it returns, we assume it recovered? This is complex. 
                        // For simplicity: if it returns, we resolve with that.
                        rejectedPromise = Promise.resolve(result as any);
                    } catch (innerError) {
                        rejectedPromise = Promise.reject(innerError);
                    }
                }
            }
            return rejectedPromise;
        }
    }

    get<T = any>(url: string, config: FetchClientConfig = {}) {
        return this.request<T>(url, { ...config, method: 'GET' });
    }

    post<T = any>(url: string, data?: any, config: FetchClientConfig = {}) {
        return this.request<T>(url, {
            ...config,
            method: 'POST',
            body: data ? JSON.stringify(data) : undefined,
            headers: { ...config.headers, 'Content-Type': 'application/json' }
        });
    }

    put<T = any>(url: string, data?: any, config: FetchClientConfig = {}) {
        return this.request<T>(url, {
            ...config,
            method: 'PUT',
            body: typeof data === 'object' && !Buffer.isBuffer(data) ? JSON.stringify(data) : data,
            // Helper: if object map to json, if string/buffer leave as is
            headers: {
                ...config.headers,
                ...(typeof data === 'object' && !Buffer.isBuffer(data) ? { 'Content-Type': 'application/json' } : {})
            }
        });
    }

    delete<T = any>(url: string, config: FetchClientConfig = {}) {
        return this.request<T>(url, { ...config, method: 'DELETE' });
    }

    // Helper for simple "is this error from us" checks
    static isFetchError(error: any): boolean {
        return !!error.response && !!error.config;
    }
}

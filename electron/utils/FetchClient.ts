import fetch, {
  type Headers,
  type Request,
  type RequestInit,
} from 'node-fetch';
import { HttpsProxyAgent } from 'https-proxy-agent';

type QueryParamValue = string | number | boolean | undefined;
type RequestHeaders = Record<string, string>;

export interface FetchClientConfig extends Omit<RequestInit, 'headers'> {
  baseURL?: string;
  params?: Record<string, QueryParamValue>;
  timeout?: number;
  proxyUrl?: string;
  headers?: RequestHeaders;
}

export interface ResolvedFetchClientConfig extends FetchClientConfig {
  url: string;
}

export interface FetchResponse<T = unknown> {
  data: T;
  status: number;
  statusText: string;
  headers: Headers;
  config: ResolvedFetchClientConfig;
  request?: Request;
}

export interface FetchClientError<T = unknown> extends Error {
  response?: FetchResponse<T>;
  config?: ResolvedFetchClientConfig;
}

export type Interceptor<V> = {
  onFulfilled?: (value: V) => V | Promise<V>;
  onRejected?: (error: unknown) => unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isFetchResponse<T>(value: unknown): value is FetchResponse<T> {
  return isRecord(value) && typeof value.status === 'number' && 'config' in value;
}

export class FetchClient {
  public defaults: FetchClientConfig;

  public interceptors = {
    request: {
      handlers: [] as Interceptor<ResolvedFetchClientConfig>[],
      use: (
        onFulfilled?: (
          value: ResolvedFetchClientConfig,
        ) => ResolvedFetchClientConfig | Promise<ResolvedFetchClientConfig>,
        onRejected?: (error: unknown) => unknown,
      ) => {
        this.interceptors.request.handlers.push({ onFulfilled, onRejected });
        return this.interceptors.request.handlers.length - 1;
      },
    },
    response: {
      handlers: [] as Interceptor<FetchResponse>[],
      use: (
        onFulfilled?: (
          value: FetchResponse,
        ) => FetchResponse | Promise<FetchResponse>,
        onRejected?: (error: unknown) => unknown,
      ) => {
        this.interceptors.response.handlers.push({ onFulfilled, onRejected });
        return this.interceptors.response.handlers.length - 1;
      },
    },
  };

  constructor(defaults: FetchClientConfig = {}) {
    this.defaults = defaults;
  }

  static create(defaults: FetchClientConfig = {}) {
    return new FetchClient(defaults);
  }

  private async request<T = unknown>(
    url: string,
    config: FetchClientConfig = {},
  ): Promise<FetchResponse<T>> {
    let fullUrl = url;
    if (config.baseURL && !url.startsWith('http')) {
      const base = config.baseURL.replace(/\/$/, '');
      const relativePath = url.replace(/^\//, '');
      fullUrl = `${base}/${relativePath}`;
    } else if (this.defaults.baseURL && !url.startsWith('http')) {
      const base = this.defaults.baseURL.replace(/\/$/, '');
      const relativePath = url.replace(/^\//, '');
      fullUrl = `${base}/${relativePath}`;
    }

    const params = { ...this.defaults.params, ...config.params };
    if (params && Object.keys(params).length > 0) {
      const parsedUrl = new URL(fullUrl);
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          parsedUrl.searchParams.append(key, String(value));
        }
      });
      fullUrl = parsedUrl.toString();
    }

    let mergedConfig: ResolvedFetchClientConfig = {
      ...this.defaults,
      ...config,
      params,
      headers: {
        ...this.defaults.headers,
        ...config.headers,
      },
      url: fullUrl,
    };

    for (const handler of this.interceptors.request.handlers) {
      if (handler.onFulfilled) {
        mergedConfig = await handler.onFulfilled(mergedConfig);
      }
    }

    const {
      timeout,
      proxyUrl,
      baseURL,
      params: _params,
      url: resolvedUrl,
      ...fetchOptions
    } = mergedConfig;
    void baseURL;
    void _params;
    void resolvedUrl;

    let timer: NodeJS.Timeout | null = null;
    if (timeout) {
      const controller = new AbortController();
      fetchOptions.signal = controller.signal;
      timer = setTimeout(() => controller.abort(), timeout);
    }

    if (proxyUrl) {
      try {
        fetchOptions.agent = new HttpsProxyAgent(proxyUrl);
      } catch {
        console.warn('Invalid proxy URL in FetchClient:', proxyUrl);
      }
    } else if (this.defaults.proxyUrl && !config.agent) {
      try {
        fetchOptions.agent = new HttpsProxyAgent(this.defaults.proxyUrl);
      } catch {
        console.warn('Invalid default proxy URL in FetchClient:', this.defaults.proxyUrl);
      }
    }

    try {
      const response = await fetch(fullUrl, fetchOptions);
      if (timer) {
        clearTimeout(timer);
      }

      const contentType = response.headers.get('content-type');
      const responseData: unknown =
        contentType && contentType.includes('application/json')
          ? await response.json()
          : await response.text();

      let fetchResponse: FetchResponse<T> = {
        data: responseData as T,
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        config: mergedConfig,
        request: undefined,
      };

      for (const handler of this.interceptors.response.handlers) {
        if (handler.onFulfilled) {
          fetchResponse = await handler.onFulfilled(fetchResponse) as FetchResponse<T>;
        }
      }

      if (fetchResponse.status < 200 || fetchResponse.status >= 300) {
        const error = new Error(
          `Request failed with status code ${fetchResponse.status}`,
        ) as FetchClientError<T>;
        error.response = fetchResponse;
        error.config = mergedConfig;
        throw error;
      }

      return fetchResponse;
    } catch (error) {
      if (timer) {
        clearTimeout(timer);
      }

      let currentError: unknown = error;
      for (const handler of this.interceptors.response.handlers) {
        if (!handler.onRejected) {
          continue;
        }

        try {
          const result = await handler.onRejected(currentError);
          if (isFetchResponse<T>(result)) {
            return result;
          }
          currentError = result;
        } catch (innerError) {
          currentError = innerError;
        }
      }

      throw currentError;
    }
  }

  get<T = unknown>(url: string, config: FetchClientConfig = {}) {
    return this.request<T>(url, { ...config, method: 'GET' });
  }

  post<T = unknown>(url: string, data?: unknown, config: FetchClientConfig = {}) {
    return this.request<T>(url, {
      ...config,
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
      headers: { ...config.headers, 'Content-Type': 'application/json' },
    });
  }

  put<T = unknown>(
    url: string,
    data?: RequestInit['body'] | Record<string, unknown>,
    config: FetchClientConfig = {},
  ) {
    const isJsonBody =
      typeof data === 'object' &&
      data !== null &&
      !Buffer.isBuffer(data) &&
      !(data instanceof ArrayBuffer) &&
      !(ArrayBuffer.isView(data));

    return this.request<T>(url, {
      ...config,
      method: 'PUT',
      body: isJsonBody ? JSON.stringify(data) : (data as RequestInit['body']),
      headers: {
        ...config.headers,
        ...(isJsonBody ? { 'Content-Type': 'application/json' } : {}),
      },
    });
  }

  delete<T = unknown>(url: string, config: FetchClientConfig = {}) {
    return this.request<T>(url, { ...config, method: 'DELETE' });
  }

  static isFetchError(error: unknown): error is FetchClientError {
    return isRecord(error) && ('response' in error || 'config' in error);
  }
}

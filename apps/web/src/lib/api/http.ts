export interface HttpErrorDetails {
  readonly status: number;
  readonly message: string;
  readonly code?: string;
}

export class HttpClientError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(details: HttpErrorDetails) {
    super(details.message);
    this.name = "HttpClientError";
    this.status = details.status;
    this.code = details.code;
  }
}

interface HttpRequestOptions {
  readonly headers?: Record<string, string>;
  readonly params?: Record<string, string | number | boolean>;
  readonly signal?: AbortSignal;
}

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

async function request<TResponse>(
  endpoint: string,
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  body?: Record<string, string | number | boolean | object | undefined>,
  options: HttpRequestOptions = {}
): Promise<TResponse> {
  const url = new URL(endpoint.startsWith("http") ? endpoint : `${BASE_URL}${endpoint}`, "http://localhost:3000");

  if (options.params) {
    Object.entries(options.params).forEach(([key, val]) => {
      url.searchParams.append(key, String(val));
    });
  }

  const defaultHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  const response = await fetch(url.toString(), {
    method,
    headers: { ...defaultHeaders, ...options.headers },
    body: body ? JSON.stringify(body) : undefined,
    signal: options.signal,
  });

  if (!response.ok) {
    let errorMessage = `HTTP Error: ${response.status} ${response.statusText}`;
    try {
      const errorJson = (await response.json()) as { message?: string; code?: string };
      if (errorJson.message) {
        errorMessage = errorJson.message;
      }
    } catch {
      // Fallback to status text
    }

    throw new HttpClientError({
      status: response.status,
      message: errorMessage,
    });
  }

  return (await response.json()) as TResponse;
}

export const http = {
  get<T>(endpoint: string, options?: HttpRequestOptions): Promise<T> {
    return request<T>(endpoint, "GET", undefined, options);
  },
  post<T>(
    endpoint: string,
    body: Record<string, string | number | boolean | object | undefined>,
    options?: HttpRequestOptions
  ): Promise<T> {
    return request<T>(endpoint, "POST", body, options);
  },
  put<T>(
    endpoint: string,
    body: Record<string, string | number | boolean | object | undefined>,
    options?: HttpRequestOptions
  ): Promise<T> {
    return request<T>(endpoint, "PUT", body, options);
  },
  patch<T>(
    endpoint: string,
    body: Record<string, string | number | boolean | object | undefined>,
    options?: HttpRequestOptions
  ): Promise<T> {
    return request<T>(endpoint, "PATCH", body, options);
  },
  delete<T>(endpoint: string, options?: HttpRequestOptions): Promise<T> {
    return request<T>(endpoint, "DELETE", undefined, options);
  },
};

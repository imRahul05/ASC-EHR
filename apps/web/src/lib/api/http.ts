import axios, {
  type AxiosInstance,
  type AxiosRequestConfig,
  type AxiosResponse,
  isAxiosError,
} from "axios";

export interface ApiErrorPayload {
  readonly message?: string;
  readonly code?: string;
  readonly details?: Record<string, string>;
}

export interface ApiErrorDetails {
  readonly status: number;
  readonly message: string;
  readonly code?: string;
  readonly details?: Record<string, string>;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly details?: Record<string, string>;

  constructor(error: ApiErrorDetails) {
    super(error.message);
    this.name = "ApiError";
    this.status = error.status;
    this.code = error.code;
    this.details = error.details;
  }
}

const apiClient: AxiosInstance = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? "",
  timeout: 15000,
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
});

// Response interceptor to normalize errors into ApiError
apiClient.interceptors.response.use(
  (response: AxiosResponse) => response,
  (error: Error) => {
    if (isAxiosError<ApiErrorPayload>(error)) {
      const status = error.response?.status ?? 500;
      const data = error.response?.data;
      const message =
        data?.message ??
        error.message ??
        "An unexpected network or server error occurred.";

      return Promise.reject(
        new ApiError({
          status,
          message,
          code: data?.code ?? error.code,
          details: data?.details,
        })
      );
    }

    return Promise.reject(
      new ApiError({
        status: 500,
        message: error.message || "An unexpected error occurred.",
      })
    );
  }
);

export const http = {
  async get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await apiClient.get<T>(url, config);
    return response.data;
  },

  async post<T, D = Record<string, string | number | boolean | object | undefined>>(
    url: string,
    data?: D,
    config?: AxiosRequestConfig
  ): Promise<T> {
    const response = await apiClient.post<T>(url, data, config);
    return response.data;
  },

  async put<T, D = Record<string, string | number | boolean | object | undefined>>(
    url: string,
    data?: D,
    config?: AxiosRequestConfig
  ): Promise<T> {
    const response = await apiClient.put<T>(url, data, config);
    return response.data;
  },

  async patch<T, D = Record<string, string | number | boolean | object | undefined>>(
    url: string,
    data?: D,
    config?: AxiosRequestConfig
  ): Promise<T> {
    const response = await apiClient.patch<T>(url, data, config);
    return response.data;
  },

  async delete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await apiClient.delete<T>(url, config);
    return response.data;
  },

  /** Direct access to underlying AxiosInstance if custom interceptors or config are required */
  client: apiClient,
};

// Browser/Server shared client for apps/api. Apps import request functions from here;
// they never create their own HTTP client (see LEARNING_MISTAKES.md LM-001).
// React (TanStack Query) hooks + query keys live in the "@asc/api-client/react" entry.
export { ApiError, authHeaders, http, setAccessToken, type RequestOptions } from "./http";
export * from "./auth";
export * from "./clinical";
export * from "./health";

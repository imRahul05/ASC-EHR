// Browser/Server shared client for apps/api. Apps import request functions from here;
// they never create their own HTTP client (see LEARNING_MISTAKES.md LM-001).
export { ApiError, http, type RequestOptions } from "./http";
export * from "./auth";
export * from "./dashboard";
export * from "./health";

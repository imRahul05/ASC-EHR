// Shared type definitions
export type BaseEntity = {
  id: string;
  createdAt: string;
  updatedAt: string;
};

export * from "./api.js";
export * from "./auth.js";
export * from "./case.js";
export * from "./dashboard.js";
export * from "./jobs.js";

// Shared type definitions
export type BaseEntity = {
  id: string;
  createdAt: string;
  updatedAt: string;
};

export * from "./api.js";
export * from "./auth.js";
export * from "./clinical.js";
export * from "./jobs.js";
export * from "./capability.js";

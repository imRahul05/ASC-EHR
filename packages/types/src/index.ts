// Shared type definitions
export type BaseEntity = {
  id: string;
  createdAt: string;
  updatedAt: string;
};

export * from "./auth.js";
export * from "./case.js";
export * from "./jobs.js";

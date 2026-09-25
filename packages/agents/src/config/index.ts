/**
 * Agent configuration — single source of truth. See packages/agents/README.md for diagrams.
 *
 *   reasoning.ts         Reasoning tiers (`Reasoning.High`) + helpers
 *   tasks.ts             Task catalog (`Task.MedicalCoding`) + per-task policy
 *   models/<vendor>.ts   WHAT: logical models (`Models.claudeOpus55`) — no API ids
 *   providers/<sdk>.ts   HOW: one Vercel AI SDK provider each — BAA flag + model factory
 *   hosting/<target>.ts  WHERE: endpoints + model id / deployment name per model
 *   routing.ts           Tier → ordered logical models, per routing profile
 *   validate.ts          Static config checks (run in tests)
 */
export * from './hosting/index.js';
export * from './models/index.js';
export * from './providers/index.js';
export * from './reasoning.js';
export * from './routing.js';
export * from './tasks.js';
export * from './validate.js';

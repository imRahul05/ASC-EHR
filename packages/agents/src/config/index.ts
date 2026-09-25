/**
 * Agent configuration — single source of truth.
 *
 *   reasoning.ts        Reasoning tiers (`Reasoning.High`) + helpers
 *   tasks.ts            Task catalog (`Task.MedicalCoding`) + per-task policy
 *   models.ts           Logical models (`Models.claudeOpus55`) — no API ids
 *   routing.ts          Tier → ordered logical models, per routing profile
 *   hosting/*.ts        Where models run: endpoints (BAA, SDK adapter) + id bindings
 *   validate.ts         Static config checks (run in tests)
 */
export * from './hosting/index.js';
export * from './models.js';
export * from './reasoning.js';
export * from './routing.js';
export * from './tasks.js';
export * from './validate.js';

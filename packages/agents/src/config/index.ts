/**
 * Agent configuration — single source of truth.
 *
 *   reasoning.ts        Reasoning tiers (`Reasoning.High`) + helpers
 *   tasks.ts            Task catalog (`Task.MedicalCoding`) + per-task policy
 *   providers/*.ts      One file per provider: BAA flag, SDK adapter, models
 *   routing.ts          Tier → ordered models, per routing profile
 *   validate.ts         Static config checks (run in tests)
 */
export * from './define.js';
export * from './providers/index.js';
export * from './reasoning.js';
export * from './routing.js';
export * from './tasks.js';
export * from './validate.js';

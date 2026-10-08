import { defineConfig } from "vitest/config";

/**
 * Live tests (spikes and the policy test) run against the LOCAL Medplum from `pnpm medplum:up`
 * and `pnpm medplum:seed`. They are not part of `pnpm test`/turbo: that stays hermetic.
 * Run with `pnpm --filter bots test:medplum`. One admin login is shared by every file
 * (Medplum throttles logins to 5 per window), so files run one after the other.
 */
export default defineConfig({
  test: {
    include: ["live/**/*.live.ts"],
    globalSetup: ["live/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});

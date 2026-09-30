import { assertPublicEnvForProductionBuild } from "@asc/config/build-env";
import type { NextConfig } from "next";
import { PHASE_PRODUCTION_BUILD } from "next/constants";

const nextConfig: NextConfig = {
  // Internal packages export TypeScript source (just-in-time packages); Next compiles them.
  transpilePackages: [
    "@asc/api-client",
    "@asc/clinical-rules",
    "@asc/config",
    "@asc/types",
    "@asc/ui",
    "@asc/validation",
  ],
};

export default function config(phase: string): NextConfig {
  // NEXT_PUBLIC_* is inlined at build time: fail fast instead of shipping a localhost API URL.
  if (phase === PHASE_PRODUCTION_BUILD) assertPublicEnvForProductionBuild();
  return nextConfig;
}

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Internal packages export TypeScript source (just-in-time packages); Next compiles them.
  transpilePackages: [
    "@repo/api-client",
    "@repo/config",
    "@repo/types",
    "@repo/ui",
    "@repo/validation",
  ],
};

export default nextConfig;

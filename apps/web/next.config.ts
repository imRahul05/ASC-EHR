import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Internal packages export TypeScript source (just-in-time packages); Next compiles them.
  transpilePackages: [
    "@asc/api-client",
    "@asc/config",
    "@asc/types",
    "@asc/ui",
    "@asc/validation",
  ],
};

export default nextConfig;

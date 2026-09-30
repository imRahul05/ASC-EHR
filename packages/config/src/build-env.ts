/**
 * Build-time env checks for apps/web, loaded by next.config.ts.
 *
 * Keep this module free of relative imports: Next's config loader resolves
 * workspace TypeScript but cannot map `./x.js` specifiers to `.ts` sources.
 */

type Env = Readonly<Record<string, string | undefined>>;

/**
 * Production builds inline NEXT_PUBLIC_API_URL into the bundle, so an unset
 * value would silently ship the localhost default. Fail the build instead.
 */
export function assertPublicEnvForProductionBuild(env: Env = process.env): void {
  const value = env.NEXT_PUBLIC_API_URL;
  if (!value) {
    throw new Error(
      "NEXT_PUBLIC_API_URL is not set. Production builds need the public API URL " +
        "(e.g. https://api.example.com). See docs/DEPLOYMENT_CONFIGURATION.md.",
    );
  }
  const url = URL.canParse(value) ? new URL(value) : undefined;
  if (url?.protocol !== "https:" && url?.protocol !== "http:") {
    throw new Error("NEXT_PUBLIC_API_URL must be an absolute http(s) URL.");
  }
}

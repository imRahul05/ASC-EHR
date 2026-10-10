import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getPublicMedplumBaseUrl, getPublicMedplumClientId, isProductionBuild } from "@asc/config/public-env";

export const REFRESH_COOKIE_NAME = "asc_refresh_token";
export const SESSION_START_COOKIE_NAME = "asc_session_start";
export const ABSOLUTE_SESSION_MAX_AGE_SECONDS = 12 * 60 * 60; // 12 hours absolute (M12-3 / P05j)

interface CodeExchangePayload {
  readonly code: string;
  readonly codeVerifier: string;
}

interface RefreshPayload {
  readonly grantType: "refresh_token";
}

interface MedplumTokenResponse {
  readonly access_token?: string;
  readonly id_token?: string;
  readonly refresh_token?: string;
  readonly expires_in?: number;
}

export function isOriginAllowed(request: NextRequest): boolean {
  const secFetchSite = request.headers.get("sec-fetch-site");

  // Sec-Fetch-Site must be same-origin or none if provided
  if (secFetchSite !== null && secFetchSite !== "same-origin" && secFetchSite !== "none") {
    return false;
  }

  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const candidate = origin ?? referer;

  // Origin or referer must match request host if provided
  if (candidate !== null) {
    try {
      const candidateUrl = new URL(candidate);
      const rawForwarded = request.headers.get("x-forwarded-host");
      const firstForwarded = rawForwarded !== null ? rawForwarded.split(",")[0]?.trim() : null;
      const forwardedHost = firstForwarded !== null && firstForwarded.length > 0 ? firstForwarded : null;
      const expectedHost = forwardedHost ?? request.headers.get("host") ?? request.nextUrl.host;
      if (candidateUrl.host !== expectedHost) {
        return false;
      }
    } catch {
      return false;
    }
  }

  return true;
}

async function callMedplumToken(params: Record<string, string>): Promise<MedplumTokenResponse> {
  const baseUrl = getPublicMedplumBaseUrl();
  if (baseUrl === undefined || baseUrl.length === 0) {
    throw new Error("Medplum base URL is not configured");
  }
  const tokenUrl = `${baseUrl.replace(/\/+$/, "")}/oauth2/token`;
  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  if (!res.ok) {
    throw new Error(`Medplum token request failed with status ${res.status}`);
  }
  return res.json() as Promise<MedplumTokenResponse>;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Origin & Sec-Fetch-Site check enforced on ALL token operations
  if (!isOriginAllowed(request)) {
    return NextResponse.json({ error: "forbidden_origin" }, { status: 403 });
  }

  let body: CodeExchangePayload | RefreshPayload;
  try {
    body = (await request.json()) as CodeExchangePayload | RefreshPayload;
  } catch {
    return NextResponse.json({ error: "invalid_request_body" }, { status: 400 });
  }

  const clientId = getPublicMedplumClientId();

  // Action 1: Silent Refresh
  if ("grantType" in body && body.grantType === "refresh_token") {
    const refreshToken = request.cookies.get(REFRESH_COOKIE_NAME)?.value;
    if (refreshToken === undefined || refreshToken.length === 0) {
      return NextResponse.json({ error: "no_refresh_token" }, { status: 401 });
    }

    const nowMs = Date.now();
    const sessionStartStr = request.cookies.get(SESSION_START_COOKIE_NAME)?.value;
    const parsedStartMs = sessionStartStr !== undefined ? Number(sessionStartStr) : NaN;
    const maxDurationMs = ABSOLUTE_SESSION_MAX_AGE_SECONDS * 1000;
    const elapsedMs = nowMs - parsedStartMs;

    if (
      sessionStartStr === undefined ||
      Number.isNaN(parsedStartMs) ||
      parsedStartMs <= 0 ||
      parsedStartMs > nowMs ||
      elapsedMs >= maxDurationMs
    ) {
      const expiredResponse = NextResponse.json({ error: "session_expired" }, { status: 401 });
      expiredResponse.cookies.set({
        name: REFRESH_COOKIE_NAME,
        value: "",
        httpOnly: true,
        secure: isProductionBuild(),
        sameSite: "strict",
        path: "/api/auth",
        maxAge: 0,
      });
      expiredResponse.cookies.set({
        name: SESSION_START_COOKIE_NAME,
        value: "",
        httpOnly: true,
        secure: isProductionBuild(),
        sameSite: "strict",
        path: "/api/auth",
        maxAge: 0,
      });
      return expiredResponse;
    }

    const sessionStartMs = parsedStartMs;
    const remainingSeconds = Math.max(0, Math.floor((maxDurationMs - elapsedMs) / 1000));

    try {
      const data = await callMedplumToken({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        ...(clientId !== undefined && clientId.length > 0 ? { client_id: clientId } : {}),
      });

      if (data.access_token === undefined) {
        throw new Error("No access token returned from refresh");
      }

      const response = NextResponse.json({
        accessToken: data.access_token,
        idToken: data.id_token,
        expiresIn: data.expires_in,
        sessionStartedAt: sessionStartMs,
      });

      if (data.refresh_token !== undefined) {
        response.cookies.set({
          name: REFRESH_COOKIE_NAME,
          value: data.refresh_token,
          httpOnly: true,
          secure: isProductionBuild(),
          sameSite: "strict",
          path: "/api/auth",
          maxAge: remainingSeconds,
        });
        response.cookies.set({
          name: SESSION_START_COOKIE_NAME,
          value: String(sessionStartMs),
          httpOnly: true,
          secure: isProductionBuild(),
          sameSite: "strict",
          path: "/api/auth",
          maxAge: remainingSeconds,
        });
      }
      return response;
    } catch {
      // On refresh failure, clear cookies immediately
      const errResponse = NextResponse.json({ error: "refresh_failed" }, { status: 401 });
      errResponse.cookies.set({
        name: REFRESH_COOKIE_NAME,
        value: "",
        httpOnly: true,
        secure: isProductionBuild(),
        sameSite: "strict",
        path: "/api/auth",
        maxAge: 0,
      });
      errResponse.cookies.set({
        name: SESSION_START_COOKIE_NAME,
        value: "",
        httpOnly: true,
        secure: isProductionBuild(),
        sameSite: "strict",
        path: "/api/auth",
        maxAge: 0,
      });
      return errResponse;
    }
  }

  // Action 2: Code exchange
  if ("code" in body && "codeVerifier" in body) {
    if (typeof body.code !== "string" || body.code.length === 0 || typeof body.codeVerifier !== "string" || body.codeVerifier.length === 0) {
      return NextResponse.json({ error: "invalid_code_or_verifier" }, { status: 400 });
    }

    try {
      const data = await callMedplumToken({
        grant_type: "authorization_code",
        code: body.code,
        code_verifier: body.codeVerifier,
        ...(clientId !== undefined && clientId.length > 0 ? { client_id: clientId } : {}),
      });

      if (data.access_token === undefined) {
        return NextResponse.json({ error: "no_access_token" }, { status: 400 });
      }

      const nowMs = Date.now();
      const response = NextResponse.json({
        accessToken: data.access_token,
        idToken: data.id_token,
        expiresIn: data.expires_in,
        sessionStartedAt: nowMs,
      });

      if (data.refresh_token !== undefined) {
        response.cookies.set({
          name: REFRESH_COOKIE_NAME,
          value: data.refresh_token,
          httpOnly: true,
          secure: isProductionBuild(),
          sameSite: "strict",
          path: "/api/auth",
          maxAge: ABSOLUTE_SESSION_MAX_AGE_SECONDS,
        });
        response.cookies.set({
          name: SESSION_START_COOKIE_NAME,
          value: String(nowMs),
          httpOnly: true,
          secure: isProductionBuild(),
          sameSite: "strict",
          path: "/api/auth",
          maxAge: ABSOLUTE_SESSION_MAX_AGE_SECONDS,
        });
      }
      return response;
    } catch {
      return NextResponse.json(
        { error: "token_exchange_failed", message: "Failed to exchange authorization code with identity provider" },
        { status: 400 },
      );
    }
  }

  return NextResponse.json({ error: "unsupported_grant" }, { status: 400 });
}

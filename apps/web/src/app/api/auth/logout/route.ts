import { isProductionBuild } from "@asc/config/public-env";
import { type NextRequest, NextResponse } from "next/server";
import { isOriginAllowed, REFRESH_COOKIE_NAME, SESSION_START_COOKIE_NAME } from "../token/route";

export function POST(request: NextRequest): NextResponse {
  if (!isOriginAllowed(request)) {
    return NextResponse.json({ error: "forbidden_origin" }, { status: 403 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: REFRESH_COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: isProductionBuild(),
    sameSite: "strict",
    path: "/api/auth",
    maxAge: 0,
  });
  response.cookies.set({
    name: SESSION_START_COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: isProductionBuild(),
    sameSite: "strict",
    path: "/api/auth",
    maxAge: 0,
  });
  return response;
}

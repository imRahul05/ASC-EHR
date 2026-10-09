import { isProductionBuild } from "@asc/config/public-env";
import { NextResponse } from "next/server";
import { REFRESH_COOKIE_NAME } from "../token/route";

export function POST(): NextResponse {
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
  return response;
}

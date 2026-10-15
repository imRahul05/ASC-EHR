import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, buildUrl, http, setAccessToken, setFacilityId } from "./http";

function stubFetch(response: Response | Error) {
  const fn = vi.fn((_input: string, _init?: RequestInit) =>
    response instanceof Error ? Promise.reject(response) : Promise.resolve(response),
  );
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
  setFacilityId(null);
  setAccessToken(null);
});

describe("http", () => {
  it("returns parsed JSON and sends query params", async () => {
    const fetchMock = stubFetch(Response.json({ ok: true }));
    await expect(http.get<{ ok: boolean }>("/dashboard", { query: { role: "NURSE" } })).resolves.toEqual({ ok: true });
    expect(fetchMock.mock.calls[0]?.[0]).toBe("http://localhost:4000/dashboard?role=NURSE");
  });

  it("serialises the body for writes", async () => {
    const fetchMock = stubFetch(Response.json({}));
    await http.post("/auth/login", { email: "a@b.c" });
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBe(JSON.stringify({ email: "a@b.c" }));
  });

  it("injects x-facility-id header when setFacilityId is configured", async () => {
    setFacilityId("fac-omega");
    const fetchMock = stubFetch(Response.json({ ok: true }));
    await http.get("/schedule");
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({
      "x-facility-id": "fac-omega",
    });
    setFacilityId(null);
  });

  it("omits x-facility-id header when facilityId is null", async () => {
    setFacilityId(null);
    const fetchMock = stubFetch(Response.json({ ok: true }));
    await http.get("/schedule");
    expect(fetchMock.mock.calls[0]?.[1]?.headers).not.toHaveProperty("x-facility-id");
  });

  it("maps an error body to ApiError", async () => {
    stubFetch(Response.json({ message: "Invalid credentials", code: "AUTH_INVALID" }, { status: 401 }));
    const error = await http.post("/auth/login", {}).catch((e: Error) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 401, message: "Invalid credentials", code: "AUTH_INVALID" });
  });

  it("falls back to a generic message when the error body is not the expected shape", async () => {
    stubFetch(new Response("<html>oops</html>", { status: 502 }));
    await expect(http.get("/health")).rejects.toMatchObject({ status: 502, message: "Request failed with status 502" });
  });

  it("maps network failures to ApiError with status 0", async () => {
    stubFetch(new TypeError("fetch failed"));
    await expect(http.get("/health")).rejects.toMatchObject({ status: 0, code: "NETWORK_ERROR" });
  });
});

describe("buildUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("keeps a path prefix on the API base URL (reverse proxy under /api)", () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://app.example.com/api/");
    expect(buildUrl("/auth/login", { next: "/cases" })).toBe(
      "https://app.example.com/api/auth/login?next=%2Fcases",
    );
  });
});

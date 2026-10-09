import { describe, expect, it } from "vitest";

import { createBrowserMedplumClient } from "./medplum/browser";
import { createClientCredentialsClient, createOnBehalfClient } from "./server";

describe("createOnBehalfClient (apps/api)", () => {
  it("acts with the user's own token, at the configured Medplum only", () => {
    const client = createOnBehalfClient({ baseUrl: "http://localhost:8203/", accessToken: "user-token" });
    expect(client.getAccessToken()).toBe("user-token");
    expect(client.getBaseUrl()).toBe("http://localhost:8203/");
  });

  it("refuses a missing token or a base URL that is not explicit", () => {
    expect(() => createOnBehalfClient({ baseUrl: "http://localhost:8203/", accessToken: "" })).toThrow("access token is required");
    expect(() => createOnBehalfClient({ baseUrl: "localhost:8203", accessToken: "t" })).toThrow("must be an http(s) URL");
  });

  it("keeps each user's token in that client's memory: one request's token never reaches another's client", () => {
    createOnBehalfClient({ baseUrl: "http://localhost:8203/", accessToken: "user-a-token" });
    const other = createOnBehalfClient({ baseUrl: "http://localhost:8203/", accessToken: "user-b-token" });
    expect(other.getAccessToken()).toBe("user-b-token");
    expect(createBrowserMedplumClient({ baseUrl: "http://localhost:8203/", clientId: undefined })?.getAccessToken()).toBeUndefined();
  });
});

describe("createClientCredentialsClient (apps/worker)", () => {
  it("signs in with the client credentials grant and fails when Medplum refuses", async () => {
    await expect(createClientCredentialsClient({ baseUrl: "http://127.0.0.1:9/", clientId: "c", clientSecret: "s" })).rejects.toThrow();
  });
});

describe("createBrowserMedplumClient (apps/web)", () => {
  it("returns no client when Medplum is not configured, so nothing defaults to a hosted Medplum", () => {
    expect(createBrowserMedplumClient({ baseUrl: undefined, clientId: undefined })).toBeUndefined();
    expect(createBrowserMedplumClient({ baseUrl: "", clientId: "web" })).toBeUndefined();
  });

  it("uses the configured base URL and client id", () => {
    const client = createBrowserMedplumClient({ baseUrl: "http://localhost:8203/", clientId: "web" });
    expect(client?.getBaseUrl()).toBe("http://localhost:8203/");
  });
});

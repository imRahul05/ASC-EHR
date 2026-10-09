import type { MedplumClient } from "@asc/api-client/server";
import { describe, expect, it, vi } from "vitest";

import { createWorkerMedplum, WorkerMedplumError } from "./medplum.js";

const clients = {
  "org-a": { clientId: "client-a", clientSecret: "secret-a" },
  "org-b": { clientId: "client-b", clientSecret: "secret-b" },
};
const baseUrl = "http://localhost:8203/";
/** The worker only chooses WHICH credentials sign in; no client behaviour is exercised, so a stub is enough. */
const signedIn = () => Promise.resolve({} as MedplumClient);

describe("createWorkerMedplum (#60)", () => {
  it("signs in with the facility's own credentials, once per facility", async () => {
    const connect = vi.fn(signedIn);
    const { createFacilityWorkerClient } = createWorkerMedplum({ baseUrl, clients }, connect);
    const a = await createFacilityWorkerClient("org-a");
    expect(await createFacilityWorkerClient("org-a")).toBe(a);
    await createFacilityWorkerClient("org-b");
    expect(connect.mock.calls).toEqual([
      [{ baseUrl, clientId: "client-a", clientSecret: "secret-a" }],
      [{ baseUrl, clientId: "client-b", clientSecret: "secret-b" }],
    ]);
  });

  it("never falls back to another facility's client or a tenant-wide one", async () => {
    const connect = vi.fn(signedIn);
    const { createFacilityWorkerClient } = createWorkerMedplum({ baseUrl, clients }, connect);
    await expect(createFacilityWorkerClient("org-c")).rejects.toThrow("no worker client for this facility");
    await expect(createFacilityWorkerClient("__proto__")).rejects.toThrow("no worker client for this facility");
    await expect(createWorkerMedplum({ baseUrl, clients: undefined }, connect).createFacilityWorkerClient("org-a")).rejects.toThrow(WorkerMedplumError);
    expect(connect).not.toHaveBeenCalled();
  });

  it("picks a PHI job's client from its validated facility only, and refuses a job without tenant and facility", async () => {
    const connect = vi.fn(signedIn);
    const { clientForJob } = createWorkerMedplum({ baseUrl, clients }, connect);
    const { data } = await clientForJob({ tenantId: "t-1", facilityId: "org-b", patientId: "pat-1" });
    expect(data.facilityId).toBe("org-b");
    expect(connect).toHaveBeenCalledWith({ baseUrl, clientId: "client-b", clientSecret: "secret-b" });
    await expect(clientForJob({ tenantId: "t-1", patientId: "pat-1" })).rejects.toThrow("invalid PHI job data");
    await expect(clientForJob({ tenantId: "t-1", facilityId: "org-a", note: "free text" })).rejects.toThrow("invalid PHI job data");
  });

  it("does not cache a failed sign-in", async () => {
    const connect = vi.fn().mockRejectedValueOnce(new Error("refused")).mockImplementation(signedIn);
    const { createFacilityWorkerClient } = createWorkerMedplum({ baseUrl, clients }, connect);
    await expect(createFacilityWorkerClient("org-a")).rejects.toThrow("refused");
    await expect(createFacilityWorkerClient("org-a")).resolves.toEqual({});
    expect(connect).toHaveBeenCalledTimes(2);
  });
});

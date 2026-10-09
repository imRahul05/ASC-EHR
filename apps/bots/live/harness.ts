import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { type AccessPolicy as CompiledPolicy, compilePolicy, ROLE_TEMPLATES } from "@asc/authz";
import { ClientStorage, MedplumClient, MemoryStorage } from "@medplum/core";
import type { AccessPolicy, ClientApplication, ProjectMembership } from "@medplum/fhirtypes";
import { inject } from "vitest";

/** Everything the live tests create is tagged with this system and named `spike-*`: local, synthetic. */
export const SPIKE_SYSTEM = "urn:asc-ehr:spike";
export const spikeIdentifier = (key: string) => ({ system: SPIKE_SYSTEM, value: key });
export const spikeCondition = (key: string) => `identifier=${SPIKE_SYSTEM}|${key}`;

/** A bearer token with raw HTTP: a revoked token must give a status, not a client-side retry loop. */
export type Caller = {
  readonly token: string;
  request(method: "GET" | "PUT" | "POST", path: string, body?: unknown): Promise<{ status: number; body: unknown }>;
};

export function caller(baseUrl: string, token: string): Caller {
  return {
    token,
    async request(method, path, body) {
      const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: { authorization: `Bearer ${token}`, "content-type": "application/fhir+json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const text = await response.text();
      return { status: response.status, body: text.length === 0 ? undefined : (JSON.parse(text) as unknown) };
    },
  };
}

export async function clientCredentialsToken(baseUrl: string, clientId: string, secret: string): Promise<string> {
  const response = await fetch(`${baseUrl}oauth2/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: clientId, client_secret: secret }),
  });
  const body = (await response.json()) as { access_token?: string };
  if (!response.ok || body.access_token === undefined) throw new Error(`client credentials failed with ${response.status}`);
  return body.access_token;
}

export const THROTTLED =
  "Medplum throttled the login (5 per window; a full live run signs in 4 times, and the seed once). Wait about a minute and run again.";

/**
 * Password login for a spike user: the authorization-code flow with a plain PKCE challenge, over raw HTTP.
 * Medplum throttles logins (5 per window), so a live test file logs in at most once.
 */
export async function userLogin(baseUrl: string, credentials: { email: string; password: string }, clientId?: string) {
  const verifier = randomBytes(32).toString("base64url");
  const login = await fetch(`${baseUrl}auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...credentials, scope: "openid", codeChallenge: verifier, codeChallengeMethod: "plain", ...(clientId === undefined ? {} : { clientId }) }),
  });
  const { code } = (await login.json()) as { code?: string };
  if (login.status === 429) throw new Error(THROTTLED);
  if (code === undefined) throw new Error(`login returned no code (${login.status})`);
  const response = await fetch(`${baseUrl}oauth2/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code, code_verifier: verifier, ...(clientId === undefined ? {} : { client_id: clientId }) }),
  });
  const body = (await response.json()) as { access_token?: string; id_token?: string; refresh_token?: string; expires_in?: number };
  if (body.access_token === undefined) throw new Error(`token exchange failed (${response.status})`);
  return { accessToken: body.access_token, idToken: body.id_token, refreshToken: body.refresh_token, expiresIn: body.expires_in };
}

/** The decoded payload of a JWT (no verification: only for reading claims in tests). */
export const jwtClaims = (jwt: string) => JSON.parse(Buffer.from(jwt.split(".")[1] ?? "", "base64url").toString()) as Record<string, unknown>;

/** A compiled policy as a Medplum resource (the compiler's readonly arrays do not match the generated types). */
export const asMedplumPolicy = (policy: CompiledPolicy, name: string) => ({ ...(JSON.parse(JSON.stringify(policy)) as AccessPolicy), name });

/** What `pnpm medplum:seed` wrote (ids only are used here). The file is git-ignored; a missing one means the seed has not run. */
export function seedOutput() {
  try {
    return JSON.parse(readFileSync(new URL("../.seed-output.json", import.meta.url), "utf8")) as {
      facilityId: string;
      secondFacilityId: string;
      practitioners: Record<string, string>;
      clientApplications: Record<string, { id: string; secret?: string; facilityId?: string }>;
    };
  } catch {
    throw new Error("apps/bots/.seed-output.json is missing or unreadable. Run `pnpm medplum:seed` first.");
  }
}

export type LiveContext = ReturnType<typeof liveContext>;

/** The admin client (token from the global setup) plus helpers that create synthetic fixtures idempotently. */
export function liveContext() {
  const { baseUrl, projectId, adminToken } = inject("medplum");
  const admin = new MedplumClient({ baseUrl, storage: new ClientStorage(new MemoryStorage()) });
  admin.setAccessToken(adminToken);

  async function facility(key: string): Promise<string> {
    const found = await admin.createResourceIfNoneExist(
      { resourceType: "Organization", name: `Spike facility ${key}`, identifier: [spikeIdentifier(`facility-${key}`)] },
      spikeCondition(`facility-${key}`),
    );
    if (found.id === undefined) throw new Error("no facility id");
    return found.id;
  }

  /** Creates the policy, or replaces the resources of the one with the same name. */
  async function policy(wanted: AccessPolicy): Promise<AccessPolicy & { id: string }> {
    const [existing] = await admin.searchResources("AccessPolicy", { name: wanted.name ?? "" });
    const saved = existing?.id === undefined ? await admin.createResource(wanted) : await admin.updateResource({ ...existing, ...wanted });
    if (saved.id === undefined) throw new Error("no policy id");
    return { ...saved, id: saved.id };
  }

  /** The compiled policy of a role template, stored as `spike-<key>-v<version>`. */
  function rolePolicy(roleKey: string) {
    const template = ROLE_TEMPLATES.find((candidate) => candidate.key === roleKey);
    if (template === undefined) throw new Error(`no role template ${roleKey}`);
    const compiled = compilePolicy(template);
    return policy(asMedplumPolicy(compiled, `spike-${compiled.name}`));
  }

  /** `facilityId` sets the `facility` parameter of the access entry (the compiled `%facility`). */
  const access = (policyId: string, facilityId?: string): NonNullable<ProjectMembership["access"]>[number] => ({
    policy: { reference: `AccessPolicy/${policyId}` },
    ...(facilityId === undefined ? {} : { parameter: [{ name: "facility", valueReference: { reference: `Organization/${facilityId}` } }] }),
  });

  /**
   * A client application with a membership that has exactly `entries`: an identity without a password,
   * so no login throttle. Returns a caller with a fresh token and the membership (to disable it).
   */
  async function persona(name: string, entries: NonNullable<ProjectMembership["access"]>, options: { admin?: boolean } = {}) {
    const [found] = await admin.searchResources("ClientApplication", { "name:exact": name });
    const app: ClientApplication = found ?? (await admin.createResource({ resourceType: "ClientApplication", name, secret: randomBytes(24).toString("hex") }));
    if (app.id === undefined || app.secret === undefined) throw new Error("client application without id or secret");
    const wanted: ProjectMembership = {
      resourceType: "ProjectMembership",
      active: true,
      project: { reference: `Project/${projectId}` },
      user: { reference: `ClientApplication/${app.id}` },
      profile: { reference: `ClientApplication/${app.id}` },
      access: entries,
      ...(options.admin === undefined ? {} : { admin: options.admin }),
    };
    const [existing] = await admin.searchResources("ProjectMembership", { user: `ClientApplication/${app.id}` });
    const membership = existing === undefined ? await admin.createResource(wanted) : await admin.updateResource({ ...existing, ...wanted });
    return { caller: caller(baseUrl, await clientCredentialsToken(baseUrl, app.id, app.secret)), membership, app };
  }

  /**
   * Invites a synthetic practitioner with a generated password (`sendEmail: false`, so they can sign in at once).
   * The email is new on every run; call `remove` afterwards so the project does not collect spike users.
   */
  async function inviteUser(label: string, entries: NonNullable<ProjectMembership["access"]>) {
    const email = `spike-${label}-${randomBytes(4).toString("hex")}@example.com`;
    const password = randomBytes(18).toString("base64url");
    const membership: ProjectMembership = await admin.post(`admin/projects/${projectId}/invite`, {
      resourceType: "Practitioner",
      firstName: "Spike",
      lastName: label,
      email,
      password,
      sendEmail: false,
      membership: { access: entries },
    });
    const profileId = membership.profile?.reference?.split("/")[1];
    return {
      email,
      password,
      membership,
      async remove() {
        if (membership.id !== undefined) await admin.deleteResource("ProjectMembership", membership.id);
        if (profileId !== undefined) await admin.deleteResource("Practitioner", profileId);
      },
    };
  }

  return { baseUrl, projectId, admin, facility, policy, rolePolicy, access, persona, inviteUser };
}

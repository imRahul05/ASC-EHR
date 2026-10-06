import type { UserProfile } from "@asc/types";
import { DEMO_IDENTITIES } from "../data/identities";
import { MOCK_USER_PROFILES } from "../data/users";

type Identity = (typeof DEMO_IDENTITIES)[string];

interface MockUser {
  readonly profile: UserProfile;
  readonly identity: Identity;
}

const normalize = (email: string) => email.toLowerCase().trim();

/** The user behind a sign-in email, or undefined. There is no fallback user. */
export function findUser(email: string): MockUser | undefined {
  const key = normalize(email);
  if (Object.hasOwn(MOCK_USER_PROFILES, key) && Object.hasOwn(DEMO_IDENTITIES, key)) {
    const profile = MOCK_USER_PROFILES[key];
    const identity = DEMO_IDENTITIES[key];
    if (profile !== undefined && identity !== undefined) return { profile, identity };
  }
  return undefined;
}

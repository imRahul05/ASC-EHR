export interface UserProfile {
  readonly id: string;
  readonly email: string;
  readonly fullName: string;
  readonly roleTitle: string;
  readonly initials: string;
  readonly avatarUrl?: string;
  readonly facilityName: string;
  readonly licenseNumber?: string;
  readonly npi?: string;
  readonly specialty?: string;
  readonly careStage?: string;
  readonly department?: string;
  readonly dateOfBirth?: string;
  readonly escortName?: string;
  readonly escortPhone?: string;
}

export interface AuthSession {
  readonly user: UserProfile;
  readonly token: string;
  readonly expiresAt: string;
}

/** Demo personas are labels for one-click sign-in (a person, not a permission). */
export type DemoPersonaId = "demo-admin" | "demo-nurse" | "demo-surgeon" | "demo-anesthesia" | "demo-patient";

export interface DemoAccountPreset {
  readonly id: DemoPersonaId;
  readonly email: string;
  readonly fullName: string;
  readonly roleTitle: string;
  readonly department: string;
  readonly badgeLabel: string;
  readonly description: string;
}

export interface LoginCredentials {
  readonly email: string;
  readonly password: string;
}

export interface MfaChallenge {
  readonly loginId: string;
  readonly codeVerifier: string;
  readonly email: string;
}

export type LoginResult =
  | { readonly status: "complete" }
  | { readonly status: "mfa_required"; readonly challenge: MfaChallenge };


export type UserRole =
  | "SURGEON"
  | "ANESTHESIOLOGIST"
  | "NURSE"
  | "ADMIN"
  | "PATIENT";

export interface UserProfile {
  readonly id: string;
  readonly email: string;
  readonly fullName: string;
  readonly role: UserRole;
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

export interface DemoAccountPreset {
  readonly id: string;
  readonly role: UserRole;
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

export interface SignupPayload {
  readonly email: string;
  readonly password: string;
  readonly fullName: string;
  readonly role: UserRole;
  readonly npi?: string;
  readonly licenseNumber?: string;
  readonly specialty?: string;
  readonly careStage?: string;
  readonly department?: string;
  readonly facilityCode?: string;
  readonly dateOfBirth?: string;
  readonly escortName?: string;
  readonly escortPhone?: string;
}

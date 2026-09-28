import type { Metadata } from "next";
import { SignupPersonaSelector } from "@/components/auth/signup-persona-selector";

export const metadata: Metadata = {
  title: "Create account",
  description: "Create a staff or patient-portal account for the GI ambulatory surgery center EHR.",
};

export default function SignupPage() {
  return (
    <div className="space-y-8" data-testid="signup-page">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Create your account</h1>
        <p className="text-sm text-muted-foreground">Choose your role — the fields and your home screen follow from it.</p>
      </div>
      <SignupPersonaSelector />
    </div>
  );
}

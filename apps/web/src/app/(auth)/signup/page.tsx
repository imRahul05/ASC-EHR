import type { Metadata } from "next";
import { AccessRequestForm } from "@/components/auth/access-request-form";

export const metadata: Metadata = {
  title: "Request access",
  description: "Ask an administrator for an account in the GI ambulatory surgery center EHR.",
};

export default function SignupPage() {
  return (
    <div className="space-y-8" data-testid="signup-page">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Request access</h1>
        <p className="text-sm text-muted-foreground">
          Accounts are invited by your center&apos;s administrator. Tell us who you are and we will pass it on; your role is set when you are invited.
        </p>
      </div>
      <AccessRequestForm />
    </div>
  );
}

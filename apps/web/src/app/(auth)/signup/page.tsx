import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@asc/ui";
import { SignupPersonaSelector } from "../../../components/auth/signup-persona-selector";

export const metadata: Metadata = {
  title: "Clinical Onboarding & Registration - ASC EHR",
  description: "Register role-based credentials or patient portal access for ASC GI procedures",
};

export default function SignupPage() {
  return (
    <Card className="border border-border/80 shadow-sm bg-card">
      <CardHeader className="space-y-1 pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-bold tracking-tight">
            Role-Based Clinical Onboarding
          </CardTitle>
          <span className="text-[11px] font-mono text-muted-foreground uppercase">
            Multi-Persona
          </span>
        </div>
        <CardDescription className="text-xs">
          Select your facility role to configure specialized documentation privileges and workflows.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <SignupPersonaSelector />
      </CardContent>
    </Card>
  );
}

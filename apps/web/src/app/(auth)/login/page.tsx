import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Separator } from "@asc/ui";
import { DemoLoginBar } from "../../../components/auth/demo-login-bar";
import { LoginForm } from "../../../components/auth/login-form";

export const metadata: Metadata = {
  title: "Clinical Login - ASC EHR",
  description: "Secure access to Ambulatory Surgery Center GI Clinical EHR",
};

export default function LoginPage() {
  return (
    <Card className="border border-border/80 shadow-sm bg-card">
      <CardHeader className="space-y-1 pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-bold tracking-tight">
            Sign In to Workstation
          </CardTitle>
          <span className="text-[11px] font-mono text-muted-foreground uppercase">
            Facility #8821
          </span>
        </div>
        <CardDescription className="text-xs">
          Enter clinical credentials or select an instant demo persona to explore role-specific workflows.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Instant Demo Switcher */}
        <DemoLoginBar />

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <Separator className="w-full" />
          </div>
          <div className="relative flex justify-center text-[10px] uppercase font-mono">
            <span className="bg-card px-2 text-muted-foreground">
              Or Authenticate with Credentials
            </span>
          </div>
        </div>

        {/* Credentials Form */}
        <LoginForm />
      </CardContent>
    </Card>
  );
}

import type { Metadata } from "next";
import { isApiMockingEnabled } from "@asc/config/public-env";
import { DemoLoginBar } from "@/components/auth/demo-login-bar";
import { LoginForm } from "@/components/auth/login-form";
import { DemoExplainer } from "@/features/guide/demo-explainer";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to the GI ambulatory surgery center EHR.",
};

export default function LoginPage() {
  const showDemo = isApiMockingEnabled();

  return (
    <div className="space-y-8" data-testid="login-page">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
        <p className="text-sm text-muted-foreground">
          {showDemo
            ? "Pick a demo persona to walk the full patient journey, or use your email."
            : "Sign in with your staff account credentials."}
        </p>
      </div>
      {showDemo && (
        <>
          <div className="space-y-2">
            <DemoLoginBar />
            <p className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground" data-testid="login-demo-hint">
              <span>Start with Front desk to follow the full story.</span>
              <DemoExplainer />
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            or with email
            <span className="h-px flex-1 bg-border" />
          </div>
        </>
      )}
      <LoginForm />
    </div>
  );
}

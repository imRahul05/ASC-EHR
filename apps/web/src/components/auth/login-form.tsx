"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, Eye, EyeOff, KeyRound, Loader2, Lock, Mail, ShieldCheck } from "@asc/ui/icons";
import { Button } from "@asc/ui/components/ui/button";
import { FormField, type FieldConfig } from "@asc/ui/components/form/form-field";
import { Input } from "@asc/ui/components/ui/input";
import { cn } from "@asc/ui/lib/utils";
import type { MfaChallenge } from "@asc/types";
import { loginSchema, type LoginFormData } from "@asc/validation/auth";
import { useAuth } from "../../hooks/use-auth";

const LOGIN_FIELDS: readonly FieldConfig<keyof LoginFormData>[] = [
  {
    name: "email",
    label: "Email",
    type: "email",
    placeholder: "you@center.org",
    autoComplete: "username",
    icon: Mail,
  },
  {
    name: "password",
    label: "Password",
    type: "password",
    placeholder: "••••••••",
    autoComplete: "current-password",
    icon: Lock,
  },
];

/** Demo credentials (mock auth only — replaced by Medplum sign-in in P05). */
const DEMO_CREDENTIALS: LoginFormData = { email: "surgeon@ascehr.demo", password: "password123" };

interface MfaFormState {
  readonly challenge: MfaChallenge | null;
  readonly code: string;
  readonly error: string | null;
}

const INITIAL_MFA_STATE: MfaFormState = {
  challenge: null,
  code: "",
  error: null,
};

export function LoginForm() {
  const { login, verifyTotp, isLoggingIn } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [mfa, setMfa] = useState<MfaFormState>(INITIAL_MFA_STATE);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<LoginFormData>({ resolver: zodResolver(loginSchema), defaultValues: DEMO_CREDENTIALS });

  const onSubmit = async (credentials: LoginFormData) => {
    try {
      const result = await login(credentials);
      if (result.status === "mfa_required") {
        setMfa({
          challenge: result.challenge,
          code: "",
          error: null,
        });
      }
    } catch (err) {
      const message =
        err instanceof Error && err.message.length > 0
          ? err.message
          : "Invalid credentials. Please verify your email and password.";
      setError("root", { message });
    }
  };

  const onTotpSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (mfa.challenge === null) return;
    const cleanCode = mfa.code.trim();
    if (cleanCode.length !== 6 || !/^\d{6}$/.test(cleanCode)) {
      setMfa((prev) => ({ ...prev, error: "Please enter a valid 6-digit authentication code." }));
      return;
    }

    try {
      setMfa((prev) => ({ ...prev, error: null }));
      await verifyTotp({
        loginId: mfa.challenge.loginId,
        code: cleanCode,
        codeVerifier: mfa.challenge.codeVerifier,
        email: mfa.challenge.email,
      });
    } catch (err) {
      const message =
        err instanceof Error && err.message.length > 0
          ? err.message
          : "Invalid authentication code. Please check your authenticator app and try again.";
      setMfa((prev) => ({
        ...prev,
        error: message,
      }));
    }
  };

  const inputType = (field: FieldConfig) =>
    field.type === "password" && showPassword ? "text" : (field.type ?? "text");

  if (mfa.challenge !== null) {
    return (
      <form onSubmit={(e) => void onTotpSubmit(e)} className="space-y-4" noValidate data-testid="totp-form">
        <div className="flex items-center gap-2 p-3 rounded-lg border border-primary/20 bg-primary/5 text-xs text-primary">
          <ShieldCheck className="h-5 w-5 shrink-0 text-primary" />
          <span>Two-factor authentication required for staff accounts (M12-3).</span>
        </div>

        {mfa.error && (
          <div role="alert" className="p-3 text-xs rounded-md bg-destructive/10 text-destructive border border-destructive/20">
            {mfa.error}
          </div>
        )}

        <div className="space-y-2">
          <label htmlFor="login-totp" className="text-xs font-medium text-foreground flex items-center gap-1.5">
            <KeyRound className="h-3.5 w-3.5 text-muted-foreground" />
            6-Digit Authenticator Code
          </label>
          <Input
            id="login-totp"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
            maxLength={6}
            autoFocus
            disabled={isLoggingIn}
            value={mfa.code}
            onChange={(e) => setMfa((prev) => ({ ...prev, code: e.target.value.replace(/\D/g, "") }))}
            data-testid="totp-input"
            className="h-10 text-center text-lg tracking-widest font-mono"
          />
          <p className="text-[11px] text-muted-foreground">
            Enter the 6-digit code from your authenticator app for {mfa.challenge.email}.
          </p>
        </div>

        <Button
          type="submit"
          disabled={isLoggingIn || mfa.code.trim().length !== 6}
          variant="default"
          className="h-9 w-full font-medium"
          data-testid="totp-submit"
        >
          {isLoggingIn ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Verifying code…
            </>
          ) : (
            "Verify & Sign in"
          )}
        </Button>

        <Button
          type="button"
          variant="ghost"
          disabled={isLoggingIn}
          onClick={() => {
            setMfa(INITIAL_MFA_STATE);
          }}
          className="h-8 w-full text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
          Back to sign in
        </Button>
      </form>
    );
  }

  return (
    <form onSubmit={(event) => void handleSubmit(onSubmit)(event)} className="space-y-4" noValidate>
      {errors.root && (
        <div role="alert" className="p-3 text-xs rounded-md bg-destructive/10 text-destructive border border-destructive/20">
          {errors.root.message}
        </div>
      )}

      {LOGIN_FIELDS.map((field) => (
        <FormField
          key={field.name}
          id={`login-${field.name}`}
          label={field.label}
          icon={field.icon}
          error={errors[field.name]?.message}
          labelAction={
            field.type === "password" ? (
              <span className="text-[11px] text-muted-foreground">Reset via your administrator</span>
            ) : undefined
          }
        >
          <Input
            id={`login-${field.name}`}
            type={inputType(field)}
            placeholder={field.placeholder}
            autoComplete={field.autoComplete}
            disabled={isLoggingIn}
            aria-invalid={errors[field.name] ? true : undefined}
            className={cn("h-9 pl-9 text-sm", field.type === "password" && "pr-9")}
            {...register(field.name)}
          />
          {field.type === "password" && (
            <button
              type="button"
              className="absolute top-2.5 right-2.5 rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
              onClick={() => setShowPassword((shown) => !shown)}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          )}
        </FormField>
      ))}

      <Button type="submit" disabled={isLoggingIn} variant="outline" className="h-9 w-full font-medium" data-testid="login-submit">
        {isLoggingIn ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Signing in…
          </>
        ) : (
          "Sign in with email"
        )}
      </Button>

      <div className="text-center pt-2">
        <p className="text-xs text-muted-foreground">
          No account yet?{" "}
          <Link href="/signup" className="font-medium text-foreground underline-offset-4 hover:underline">
            Request access
          </Link>
        </p>
      </div>
    </form>
  );
}


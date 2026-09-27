"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, Loader2, Lock, Mail } from "@asc/ui/icons";
import { Button, cn, FormField, Input, type FieldConfig } from "@asc/ui";
import { loginSchema, type LoginFormData } from "@asc/validation/auth";
import { useAuth } from "../../hooks/use-auth";

const LOGIN_FIELDS: readonly FieldConfig<keyof LoginFormData>[] = [
  {
    name: "email",
    label: "Clinical Email Address",
    type: "email",
    placeholder: "provider@center.org",
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

export function LoginForm() {
  const { login, isLoggingIn } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<LoginFormData>({ resolver: zodResolver(loginSchema), defaultValues: DEMO_CREDENTIALS });

  const onSubmit = async (credentials: LoginFormData) => {
    try {
      await login(credentials);
    } catch {
      setError("root", { message: "Invalid credentials. Please verify your email and password." });
    }
  };

  const inputType = (field: FieldConfig) =>
    field.type === "password" && showPassword ? "text" : (field.type ?? "text");

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
            className={cn("pl-9 text-sm", field.type === "password" && "pr-9")}
            {...register(field.name)}
          />
          {field.type === "password" && (
            <button
              type="button"
              className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
              onClick={() => setShowPassword((shown) => !shown)}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          )}
        </FormField>
      ))}

      <Button type="submit" disabled={isLoggingIn} className="w-full h-9 font-medium text-sm">
        {isLoggingIn ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Authenticating Session...
          </>
        ) : (
          "Sign In to Center"
        )}
      </Button>

      <div className="text-center pt-2">
        <p className="text-xs text-muted-foreground">
          Need an account?{" "}
          <Link href="/signup" className="font-medium text-foreground underline-offset-4 hover:underline">
            Register clinical role or patient portal
          </Link>
        </p>
      </div>
    </form>
  );
}

"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Eye, EyeOff, Loader2, Lock, Mail } from "lucide-react";
import { Button, Input, Label } from "@asc/ui";
import { loginSchema } from "@asc/validation";
import { useAuth } from "../../hooks/use-auth";

export function LoginForm() {
  const { login, isLoggingIn } = useAuth();
  const [email, setEmail] = useState("surgeon@ascehr.demo");
  const [password, setPassword] = useState("password123");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string; form?: string }>({});

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrors({});

    const result = loginSchema.safeParse({ email, password });
    if (!result.success) {
      const fieldErrors: { email?: string; password?: string } = {};
      result.error.issues.forEach((issue) => {
        if (issue.path[0] === "email") {
          fieldErrors.email = issue.message;
        } else if (issue.path[0] === "password") {
          fieldErrors.password = issue.message;
        }
      });
      setErrors(fieldErrors);
      return;
    }

    try {
      await login({ email, password });
    } catch {
      setErrors({ form: "Invalid credentials. Please verify your email and password." });
    }
  };

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
      {errors.form && (
        <div className="p-3 text-xs rounded-md bg-destructive/10 text-destructive border border-destructive/20">
          {errors.form}
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="login-email" className="text-xs font-medium">
          Clinical Email Address
        </Label>
        <div className="relative">
          <Mail className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            id="login-email"
            type="email"
            placeholder="provider@center.org"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isLoggingIn}
            className="pl-9 text-sm"
          />
        </div>
        {errors.email && <p className="text-[11px] text-destructive">{errors.email}</p>}
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="login-password" className="text-xs font-medium">
            Password
          </Label>
          <button
            type="button"
            className="text-[11px] text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
            onClick={() => alert("Password reset link sent to demo workstation.")}
          >
            Forgot password?
          </button>
        </div>
        <div className="relative">
          <Lock className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            id="login-password"
            type={showPassword ? "text" : "password"}
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={isLoggingIn}
            className="pl-9 pr-9 text-sm"
          />
          <button
            type="button"
            className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
            onClick={() => setShowPassword(!showPassword)}
            tabIndex={-1}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        {errors.password && <p className="text-[11px] text-destructive">{errors.password}</p>}
      </div>

      <div className="flex items-center justify-between text-xs pt-1">
        <label className="flex items-center gap-2 cursor-pointer select-none text-muted-foreground hover:text-foreground">
          <input
            type="checkbox"
            defaultChecked
            className="rounded border-border text-primary focus:ring-ring"
          />
          <span>Remember workstation</span>
        </label>
      </div>

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
          <Link
            href="/signup"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Register clinical role or patient portal
          </Link>
        </p>
      </div>
    </form>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  exchangeWebAuthCode,
  getBrowserMedplumClient,
  getMe,
  setAccessToken,
} from "@asc/api-client";
import { Button } from "@asc/ui/components/ui/button";
import { Loader2 } from "@asc/ui/icons";
import { clearPendingCodeVerifier, getPendingCodeVerifier } from "../../lib/auth/pkce";
import { buildUserProfileFromSession } from "../../lib/auth/claims";
import { useAuthStore } from "../../lib/stores/auth.store";
import { workspacesFor } from "../../lib/workspaces";

export function SignInCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const code = searchParams.get("code");
  const authError = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  const [asyncError, setAsyncError] = useState<string | null>(null);

  const urlError = useMemo(() => {
    if (authError !== null) {
      return errorDescription ?? authError;
    }
    if (code === null || code.length === 0) {
      return "No authorization code returned from authentication provider.";
    }
    return null;
  }, [authError, code, errorDescription]);

  const errorMessage = urlError ?? asyncError;

  useEffect(() => {
    if (urlError !== null) return;
    if (code === null || code.length === 0) return;

    let isMounted = true;

    async function completeCallback() {
      try {
        const codeVerifier = getPendingCodeVerifier();
        clearPendingCodeVerifier();
        if (code === null) return;
        const tokenResult = await exchangeWebAuthCode(code, codeVerifier);

        const medplum = getBrowserMedplumClient();
        if (medplum !== undefined) {
          medplum.setAccessToken(tokenResult.accessToken);
        }
        setAccessToken(tokenResult.accessToken);
        if (tokenResult.idToken !== undefined) {
          useAuthStore.getState().setIdToken(tokenResult.idToken);
        }

        const me = await getMe();
        const user = buildUserProfileFromSession({
          me,
          idToken: tokenResult.idToken,
        });
        useAuthStore.getState().setSession(
          {
            user,
            token: tokenResult.accessToken,
            expiresAt: new Date(Date.now() + (tokenResult.expiresIn ?? 900) * 1000).toISOString(),
          },
          me,
          tokenResult.sessionStartedAt,
        );

        if (!isMounted) return;
        const { principal: signedIn, facilityId: facility } = useAuthStore.getState();
        router.push(workspacesFor(signedIn, facility)[0]?.home ?? "/dashboard");
      } catch (err) {
        if (!isMounted) return;
        const message = err instanceof Error ? err.message : "Failed to exchange authorization code";
        setAsyncError(message);
      }
    }

    void completeCallback();

    return () => {
      isMounted = false;
    };
  }, [code, router, urlError]);

  if (errorMessage !== null) {
    return (
      <div className="space-y-4 p-6 border rounded-lg bg-card text-card-foreground max-w-md mx-auto text-center" data-testid="callback-error">
        <h2 className="text-lg font-semibold text-destructive">Sign-in failed</h2>
        <p className="text-sm text-muted-foreground">{errorMessage}</p>
        <Button variant="outline" className="w-full" onClick={() => router.push("/login")}>
          Return to sign in
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center p-12 space-y-4" data-testid="callback-loading">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <p className="text-sm font-medium text-muted-foreground">Completing sign-in…</p>
    </div>
  );
}

import type { Metadata } from "next";
import { Suspense } from "react";
import { SignInCallbackContent } from "@/components/auth/signin-callback-content";
import { Skeleton } from "@asc/ui/components/ui/skeleton";

export const metadata: Metadata = {
  title: "Completing Sign-in",
  description: "Verifying your credentials and completing sign-in.",
};

export default function SignInCallbackPage() {
  return (
    <div className="space-y-4" data-testid="signin-callback-page">
      <Suspense
        fallback={
          <div className="p-6 space-y-3">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-32 w-full" />
          </div>
        }
      >
        <SignInCallbackContent />
      </Suspense>
    </div>
  );
}

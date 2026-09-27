import Link from "next/link";
import { Button } from "@asc/ui";
import { Activity, ArrowRight } from "@asc/ui/icons";

/** PLACEHOLDER — owner A builds the product landing page (hero, how it works, modules, security, CTA). */
export function LandingPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center" data-testid="landing-page">
      <span className="flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
        <Activity className="size-5" />
      </span>
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">The GI surgery center, end to end.</h1>
        <p className="mx-auto max-w-lg text-muted-foreground">
          Referral to recall in one calm workspace — with AI drafts clinicians review, never auto-sign.
        </p>
      </div>
      <Button render={<Link href="/login" />} nativeButton={false} size="lg" className="gap-2" data-testid="landing-sign-in">
        Sign in to the demo <ArrowRight />
      </Button>
    </main>
  );
}

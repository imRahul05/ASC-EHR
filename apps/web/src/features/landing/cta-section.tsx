import Link from "next/link";
import { Button } from "@asc/ui/components/ui/button";
import { ArrowRight } from "@asc/ui/icons";

/** Closing call to action. */
export function CtaSection() {
  return (
    <section aria-labelledby="cta-title" className="border-t border-border">
      <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
        <div className="flex flex-col items-start justify-between gap-8 rounded-3xl border border-border bg-card p-8 shadow-xs sm:p-12 lg:flex-row lg:items-end">
          <div className="max-w-xl space-y-4">
            <h2 id="cta-title" className="text-3xl leading-[1.1] font-semibold tracking-[-0.03em] text-balance sm:text-[2.75rem]">
              Walk one patient through the whole day.
            </h2>
            <p className="text-base leading-relaxed text-muted-foreground sm:text-lg">
              Sign in as the front desk, then switch to nurse, gastroenterologist and coder. Ten minutes, start to recall.
            </p>
          </div>
          <div className="flex shrink-0 flex-col gap-3 sm:flex-row">
            <Button render={<Link href="/login" />} nativeButton={false} size="lg" className="h-11 px-5 text-[15px]" data-testid="landing-cta-demo">
              Open the demo <ArrowRight aria-hidden />
            </Button>
            <Button render={<Link href="/signup" />} nativeButton={false} size="lg" variant="outline" className="h-11 px-5 text-[15px]">
              Create an account
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

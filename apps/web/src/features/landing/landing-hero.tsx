import Link from "next/link";
import { Button } from "@asc/ui";
import { ArrowRight, Sparkles } from "@asc/ui/icons";
import { ProductMock } from "./product-mock";

/** Hero: one sharp line, one sentence, two actions, the product itself. The only gradient on the site is the glow here. */
export function LandingHero() {
  return (
    <section aria-labelledby="hero-title" className="relative isolate overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute top-[-18rem] left-1/2 -z-10 h-[40rem] w-[64rem] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,var(--color-primary),transparent)] opacity-[0.14] blur-3xl dark:opacity-[0.22]"
      />
      <div className="mx-auto max-w-6xl px-4 pt-20 pb-16 sm:px-6 sm:pt-28">
        <div className="mx-auto max-w-3xl text-center">
          <Link
            href="#ai"
            className="inline-flex items-center gap-2 rounded-full border border-border bg-card/80 px-3 py-1 text-xs text-muted-foreground shadow-xs outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/40"
          >
            <Sparkles aria-hidden className="size-3.5 text-primary" />
            AI-native EHR for GI ambulatory surgery centers
            <ArrowRight aria-hidden className="size-3" />
          </Link>
          <h1 id="hero-title" className="mt-7 text-[2.75rem] leading-[1.02] font-semibold tracking-[-0.045em] text-balance sm:text-6xl lg:text-7xl">
            From faxed referral
            <br className="hidden sm:block" /> to five‑year recall.
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-pretty text-muted-foreground">
            One record for the whole endoscopy day. AI reads the fax, drafts the note and suggests the codes —
            every gate is checked, and every signature stays human.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button render={<Link href="/login" />} nativeButton={false} size="lg" className="h-11 px-5 text-[15px]" data-testid="landing-sign-in">
              Try the live demo <ArrowRight aria-hidden />
            </Button>
            <Button render={<Link href="#workflow" />} nativeButton={false} size="lg" variant="ghost" className="h-11 px-5 text-[15px]">
              See the patient journey
            </Button>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">No sign-up. Five personas. Synthetic data only.</p>
        </div>

        <div id="product" className="relative mx-auto mt-16 max-w-5xl scroll-mt-24 sm:mt-20">
          <ProductMock />
        </div>
      </div>
    </section>
  );
}

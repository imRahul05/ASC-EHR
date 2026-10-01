import type { CSSProperties } from "react";
import Link from "next/link";
import { Button } from "@asc/ui/components/ui/button";
import { cn } from "@asc/ui/lib/utils";
import { ArrowRight } from "@asc/ui/icons";
import { DemoExplainer } from "../guide/demo-explainer";
import { HeroJourney } from "./hero-journey";
import styles from "./landing-hero.module.css";
import { ProductMock } from "./product-mock";

const riseDelay = (seconds: number) => ({ "--rise-delay": `${seconds}s` }) as CSSProperties;

/**
 * Hero: fills the first screen. Aurora canvas, the headline, and the patient journey drawn live underneath it —
 * a pulse runs referral → recall and each stop shows what the product did. The product screenshot follows below.
 * Height is capped at 56rem so tall monitors (24"/27") keep the laptop spacing instead of opening a gap mid-hero.
 */
export function LandingHero() {
  return (
    <section aria-labelledby="hero-title" className={cn(styles.hero, "relative isolate overflow-hidden")}>
      <div aria-hidden className={styles.canvas}>
        <span className={cn(styles.blob, styles.blobViolet)} />
        <span className={cn(styles.blob, styles.blobTeal)} />
        <span className={cn(styles.blob, styles.blobRose)} />
        <span className={styles.grid} />
      </div>

      <div className="mx-auto flex min-h-[min(calc(100svh-3.5rem),56rem)] max-w-6xl flex-col justify-between gap-10 px-4 pt-16 pb-8 sm:px-6 sm:pt-24 lg:pt-28">
        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:gap-14">
          <h1
            id="hero-title"
            className={cn(
              styles.rise,
              "text-[clamp(2.75rem,6.2vw,5.5rem)] leading-[0.95] font-semibold [text-box:trim-start_cap_alphabetic] tracking-[-0.055em] text-balance",
            )}
          >
            From faxed referral to five&#8209;year recall.
          </h1>

          <div style={riseDelay(0.15)} className={cn(styles.rise, "max-w-md")}>
            <p className="text-lg leading-relaxed text-pretty [text-box:trim-start_cap_alphabetic] text-muted-foreground">
              The EHR for GI ambulatory surgery centers. One record for the whole endoscopy day: AI reads the fax,
              drafts the note and suggests the codes, every gate is checked, and every signature stays human.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Button render={<Link href="/login" />} nativeButton={false} size="lg" className="h-11 px-5 text-[15px]" data-testid="landing-sign-in">
                Try the live demo <ArrowRight aria-hidden />
              </Button>
              <Button render={<Link href="#workflow" />} nativeButton={false} size="lg" variant="outline" className="h-11 bg-background/60 px-5 text-[15px] backdrop-blur">
                See the patient journey
              </Button>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">No sign-up. Five personas. Synthetic data only.</p>
            <DemoExplainer withSignIn className="mt-2" />
          </div>
        </div>

        <div style={riseDelay(0.35)} className={styles.rise}>
          <HeroJourney />
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <div id="product" className="relative mx-auto max-w-5xl scroll-mt-24">
          <ProductMock />
        </div>
      </div>
    </section>
  );
}

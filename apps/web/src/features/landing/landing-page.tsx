import { AiSection } from "./ai-section";
import { CtaSection } from "./cta-section";
import { LandingFooter } from "./landing-footer";
import { LandingHero } from "./landing-hero";
import { LandingNav } from "./landing-nav";
import { ModulesSection } from "./modules-section";
import { SecuritySection } from "./security-section";
import { StatsBand } from "./stats-band";
import { WorkflowSection } from "./workflow-section";

/** `/` — public product site (static; sign-in links go through next/link so the in-memory session is kept). */
export function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground" data-testid="landing-page">
      <LandingNav />
      <main>
        <LandingHero />
        <WorkflowSection />
        <ModulesSection />
        <AiSection />
        <StatsBand />
        <SecuritySection />
        <CtaSection />
      </main>
      <LandingFooter />
    </div>
  );
}

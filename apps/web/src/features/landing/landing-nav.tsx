import Link from "next/link";
import { Button, ThemeToggle } from "@asc/ui";
import { BrandMark } from "@/components/auth/brand-mark";

const NAV_LINKS = [
  { href: "#product", label: "Product" },
  { href: "#workflow", label: "Workflow" },
  { href: "#security", label: "Security" },
] as const;

/** Sticky, minimal top nav with a translucent background. */
export function LandingNav() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/70">
      <nav aria-label="Main" className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/40" aria-label="ASC EHR home">
          <BrandMark />
        </Link>
        <ul className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((link) => (
            <li key={link.href}>
              <Link href={link.href} className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/40">
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-1.5">
          <ThemeToggle />
          <Button render={<Link href="/login" />} nativeButton={false} size="sm" variant="outline" data-testid="landing-nav-sign-in">
            Sign in
          </Button>
        </div>
      </nav>
    </header>
  );
}

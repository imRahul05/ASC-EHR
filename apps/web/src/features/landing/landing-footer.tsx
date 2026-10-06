import Link from "next/link";
import { BrandMark } from "@/components/auth/brand-mark";

const COLUMNS = [
  {
    title: "Product",
    links: [
      { href: "#product", label: "Case workspace" },
      { href: "#workflow", label: "Patient journey" },
      { href: "#ai", label: "AI" },
    ],
  },
  {
    title: "Trust",
    links: [
      { href: "#security", label: "Security & HIPAA" },
      { href: "#ai", label: "Provenance" },
    ],
  },
  {
    title: "Demo",
    links: [
      { href: "/login", label: "Sign in" },
      { href: "/signup", label: "Request access" },
    ],
  },
] as const;

export function LandingFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[minmax(0,1.5fr)_repeat(3,minmax(0,1fr))]">
        <div className="space-y-3">
          <BrandMark />
          <p className="max-w-xs text-sm text-muted-foreground">The EHR for GI ambulatory surgery centers. Demo build — all patient data is synthetic.</p>
        </div>
        {COLUMNS.map((column) => (
          <div key={column.title} className="space-y-3">
            <h3 className="text-xs font-medium text-muted-foreground">{column.title}</h3>
            <ul className="space-y-2">
              {column.links.map((link) => (
                <li key={link.label}>
                  <Link href={link.href} className="text-sm text-foreground/80 hover:text-foreground">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="mx-auto flex max-w-6xl flex-wrap justify-between gap-2 border-t border-border px-4 py-6 text-xs text-muted-foreground sm:px-6">
        <span>© 2026 ASC EHR</span>
        <span>Not for clinical use · synthetic data only</span>
      </div>
    </footer>
  );
}

import Link from "next/link";
import { ThemeToggle } from "@asc/ui/components/theme/theme-toggle";
import { AuthBrandPanel } from "@/components/auth/auth-brand-panel";
import { BrandMark } from "@/components/auth/brand-mark";
import { MockProvider } from "@/mocks/mock-provider";

interface AuthLayoutProps {
  readonly children: React.ReactNode;
}

/** Split auth layout: form column + calm brand panel (lg+). */
export default function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="grid min-h-screen bg-background text-foreground lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <div className="flex min-h-screen flex-col px-4 py-5 sm:px-10">
        <header className="flex items-center justify-between">
          <Link href="/" className="rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/40" aria-label="ASC EHR home">
            <BrandMark />
          </Link>
          <ThemeToggle />
        </header>
        <main className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-md">
            <MockProvider>{children}</MockProvider>
          </div>
        </main>
        <footer className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>Demo environment · synthetic data only</span>
          <span>Session held in memory · no PHI in URLs</span>
        </footer>
      </div>
      <AuthBrandPanel />
    </div>
  );
}

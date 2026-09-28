"use client";

import Link from "next/link";
import {
  Button,
  cn,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@asc/ui";
import { ArrowRight, CircleHelp } from "@asc/ui/icons";
import { DEMO_EXPLAINER } from "./guide-content";

interface DemoExplainerProps {
  /** Show a "Try the demo" link to /login (landing page). */
  readonly withSignIn?: boolean;
  readonly className?: string;
}

/** "New here? How the demo works" — a short explainer for the landing and login pages. */
export function DemoExplainer({ withSignIn = false, className }: DemoExplainerProps) {
  return (
    <Dialog>
      <DialogTrigger
        className={cn(
          "inline-flex items-center gap-1.5 rounded-sm text-xs font-medium text-muted-foreground underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/40",
          className,
        )}
        data-testid="demo-explainer-trigger"
      >
        <CircleHelp aria-hidden className="size-3.5" />
        New here? How the demo works
      </DialogTrigger>
      <DialogContent className="gap-5 sm:max-w-md" data-testid="demo-explainer">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold tracking-tight">How the demo works</DialogTitle>
          <DialogDescription>A working EHR front end with no backend. Four things to know:</DialogDescription>
        </DialogHeader>
        <ol className="space-y-3">
          {DEMO_EXPLAINER.map((item, index) => (
            <li key={item.id} className="flex gap-3">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent text-[11px] font-semibold text-accent-foreground tabular-nums" aria-hidden>
                {index + 1}
              </span>
              <span className="space-y-0.5">
                <span className="block text-sm font-medium">{item.title}</span>
                <span className="block text-xs leading-relaxed text-muted-foreground">{item.body}</span>
              </span>
            </li>
          ))}
        </ol>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Got it</DialogClose>
          {withSignIn && (
            <Button render={<Link href="/login" />} nativeButton={false} data-testid="demo-explainer-sign-in">
              Try the demo <ArrowRight />
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

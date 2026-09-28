/** Design targets for the platform (product goals, not measured customer results). */
const STATS = [
  { value: "< 10 s", label: "from “End procedure” to a reviewable note draft" },
  { value: "13", label: "case phases, each behind an explicit gate" },
  { value: "0", label: "AI outputs signed, attested or sent without a human" },
  { value: "1", label: "record from referral fax to surveillance letter" },
] as const;

export function StatsBand() {
  return (
    <section aria-label="Platform targets" className="border-t border-border bg-muted/30">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-10 lg:grid-cols-4">
          {STATS.map((stat) => (
            <div key={stat.label} className="flex flex-col-reverse gap-2">
              <dt className="text-sm leading-snug text-muted-foreground">{stat.label}</dt>
              <dd className="text-4xl font-semibold tracking-[-0.04em] tabular-nums sm:text-5xl">{stat.value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-10 text-xs text-muted-foreground">Design targets for the platform, not customer outcomes.</p>
      </div>
    </section>
  );
}

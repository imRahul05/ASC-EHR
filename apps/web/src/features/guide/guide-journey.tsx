"use client";

import { Badge, Button, SectionCard } from "@asc/ui";
import { ArrowRight, LoaderCircle } from "@asc/ui/icons";
import { CASE_TAB_HELP, GUIDE_SECTIONS, ROLE_BADGE, ROUTE_HELP } from "./guide-content";
import { useGoTo } from "./use-go-to";

const helpFor = (key: string) => ROUTE_HELP[key] ?? CASE_TAB_HELP[key];

/** Every feature, grouped by journey stage. "Open" switches persona when needed. */
export function GuideJourney() {
  const { goTo, pendingKey, role } = useGoTo();

  return (
    <div className="grid gap-4 lg:grid-cols-2" data-testid="guide-journey">
      {GUIDE_SECTIONS.map(({ id, title, icon: Icon, items }) => (
        <SectionCard
          key={id}
          title={
            <span className="flex items-center gap-2">
              <Icon className="size-4 text-muted-foreground" aria-hidden />
              {title}
            </span>
          }
          contentClassName="p-0"
          data-testid={`guide-section-${id}`}
        >
          <ul className="divide-y divide-border/70">
            {items.map((item) => {
              const help = helpFor(item.key);
              if (!help) return null;
              const pending = pendingKey === item.key;
              const needsSwitch = role !== item.role;
              return (
                <li key={item.key} className="flex items-start gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{help.title}</span>
                      <Badge variant="outline" className="text-[10px] font-normal text-muted-foreground">
                        {ROLE_BADGE[item.role]}
                      </Badge>
                    </div>
                    <p className="text-xs leading-relaxed text-muted-foreground">{help.purpose}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="shrink-0"
                    disabled={pendingKey !== null}
                    onClick={() => void goTo(item.role, item.href, item.key)}
                    aria-label={needsSwitch ? `Open ${help.title} as ${ROLE_BADGE[item.role]}` : `Open ${help.title}`}
                    data-testid={`guide-open-${item.key}`}
                  >
                    {pending ? <LoaderCircle className="animate-spin motion-reduce:animate-none" /> : null}
                    {needsSwitch ? `As ${ROLE_BADGE[item.role]}` : "Open"}
                    {!pending && <ArrowRight />}
                  </Button>
                </li>
              );
            })}
          </ul>
        </SectionCard>
      ))}
    </div>
  );
}

/**
 * WorklistView Component Tests (Phase P12)
 *
 * Verifies unified queue rendering, timeline badges, priority badges,
 * overdue SLA highlighting, and claim/complete trigger integration.
 *
 * Healthcare Regulatory Citations:
 * - CMS 42 CFR § 416.52: H&P verification and pre-procedure clinical queues.
 * - No Surprises Act 45 CFR § 149.610: Good Faith Estimate delivery timeline tracking.
 * - HIPAA 45 CFR § 164.312(b): Audit controls and role/capability task assignment.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type * as AscUi from "@asc/ui";
import type { WorkItem } from "@asc/types";
import { WorklistView } from "./worklist-view";

const MOCK_ITEMS: readonly WorkItem[] = [
  {
    id: "task-01",
    type: "prep_instructions",
    title: "Deliver bowel preparation instructions",
    detail: "Split-dose PEG-ELS prep for screening colonoscopy",
    priority: "routine",
    status: "open",
    dueAt: "2026-10-18T10:00:00Z",
    createdAt: "2026-10-14T08:00:00Z",
    caseId: "case-01",
    timelineMilestone: "T-7d",
  },
  {
    id: "task-02",
    type: "estimate_delivery",
    title: "Deliver Good Faith Estimate (45 CFR § 149.610)",
    detail: "Self-pay uninsured GFE breakdown",
    priority: "urgent",
    status: "open",
    dueAt: "2026-10-15T12:00:00Z",
    createdAt: "2026-10-14T08:00:00Z",
    caseId: "case-02",
    timelineMilestone: "T-3d",
  },
  {
    id: "task-03",
    type: "sign_note",
    title: "Sign procedure operative report",
    detail: "Dr. Smith procedure note awaiting attestation",
    priority: "stat",
    status: "claimed",
    ownerId: "dr-smith",
    dueAt: "2026-10-14T09:00:00Z", // overdue relative to 10:00:00Z
    createdAt: "2026-10-14T07:00:00Z",
    caseId: "case-03",
    timelineMilestone: "T-0",
  },
];

let mockSearchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useSearchParams: () => mockSearchParams,
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => "/worklist",
}));

vi.mock("@/hooks/use-can", () => ({
  useCan: () => () => false,
}));

vi.mock("@asc/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof AscUi>();
  return {
    ...actual,
    useNow: () => Date.parse("2026-10-14T10:00:00Z"),
  };
});

vi.mock("@asc/api-client/react", () => ({
  useWorklist: () => ({
    data: { items: MOCK_ITEMS, total: MOCK_ITEMS.length },
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useClaimWorkItem: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
  useCompleteWorkItem: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
}));

describe("WorklistView (Phase P12)", () => {
  it("renders all queue pills (nursing, financial, physician, front desk, coding, pathology, anesthesia)", () => {
    mockSearchParams = new URLSearchParams();
    const html = renderToStaticMarkup(<WorklistView />);

    expect(html).toContain("All Queues");
    expect(html).toContain("Nursing");
    expect(html).toContain("Financial");
    expect(html).toContain("Physician");
    expect(html).toContain("Front Desk");
    expect(html).toContain("Coding");
    expect(html).toContain("Pathology");
    expect(html).toContain("Anesthesia");
  });

  it("renders timeline milestone badges (T-7d, T-3d, T-0)", () => {
    mockSearchParams = new URLSearchParams();
    const html = renderToStaticMarkup(<WorklistView />);

    expect(html).toContain("T-7d");
    expect(html).toContain("T-3d");
    expect(html).toContain("T-0");
  });

  it("renders priority badges (routine, urgent, stat)", () => {
    mockSearchParams = new URLSearchParams();
    const html = renderToStaticMarkup(<WorklistView />);

    expect(html).toContain("routine");
    expect(html).toContain("urgent");
    expect(html).toContain("stat");
  });

  it("highlights overdue tasks with AlarmClock icon and overdue label", () => {
    mockSearchParams = new URLSearchParams();
    const html = renderToStaticMarkup(<WorklistView />);

    // task-03 is due at 09:00:00 while now is 10:00:00
    expect(html).toContain("aria-label=\"Overdue\"");
    expect(html).toContain("text-destructive");
  });

  it("renders claim and complete triggers according to task status", () => {
    mockSearchParams = new URLSearchParams();
    const html = renderToStaticMarkup(<WorklistView />);

    // task-01 is open -> should have Claim button
    expect(html).toContain("data-testid=\"worklist-claim-task-01\"");
    // task-03 is claimed -> should display claimed owner
    expect(html).toContain("dr-smith");
    // action checkmark buttons exist
    expect(html).toContain("data-testid=\"worklist-done-task-01\"");
  });

  it("filters items by queue when query param is present", () => {
    mockSearchParams = new URLSearchParams("queue=financial");
    const html = renderToStaticMarkup(<WorklistView />);

    // task-02 is estimate_delivery (financial queue)
    expect(html).toContain("Deliver Good Faith Estimate");
    // task-01 is prep_instructions (nursing queue) -> filtered out
    expect(html).not.toContain("Deliver bowel preparation instructions");
  });
});

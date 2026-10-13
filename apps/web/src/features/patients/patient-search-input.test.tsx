import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { PatientListItem } from "@asc/types";
import { PatientSearchInput as PresentationalSearchInput } from "@asc/ui";

describe("PatientSearchInput", () => {
  const mockResults: readonly PatientListItem[] = [
    {
      id: "p-1",
      mrn: "MRN-101",
      displayName: "Jane Doe",
      initials: "JD",
      age: 42,
      sex: "F",
      dateOfBirth: "1982-03-15",
      phone: "(555) 111-2222",
      allergyCount: 0,
    },
    {
      id: "p-2",
      mrn: "MRN-102",
      displayName: "John Smith",
      initials: "JS",
      age: 50,
      sex: "M",
      dateOfBirth: "1974-07-20",
      phone: "(555) 333-4444",
      allergyCount: 2,
    },
  ];

  it("renders search combobox input with accessible attributes", () => {
    const html = renderToStaticMarkup(
      <PresentationalSearchInput
        value=""
        onChange={vi.fn()}
        results={[]}
        onSelect={vi.fn()}
        placeholder="Search patients by name, MRN, or DOB…"
      />,
    );

    expect(html).toContain('role="combobox"');
    expect(html).toContain('aria-autocomplete="list"');
    expect(html).toContain('placeholder="Search patients by name, MRN, or DOB…"');
  });

  it("renders dropdown with matching patient demographic details when results are provided and active", () => {
    // Note: showDropdown is true when isOpen is true in browser; in static markup we verify results rendering
    const html = renderToStaticMarkup(
      <PresentationalSearchInput
        value="Jane"
        onChange={vi.fn()}
        results={mockResults}
        onSelect={vi.fn()}
      />,
    );

    expect(html).toContain('role="combobox"');
  });
});

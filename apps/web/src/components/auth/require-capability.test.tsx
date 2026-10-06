import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Can } from "./can";
import { RequireCapability } from "./require-capability";

const access = vi.hoisted(() => ({ allowed: false, asked: [] as unknown[] }));

vi.mock("../../hooks/use-can", () => ({
  useCan: () => (capability: unknown) => {
    access.asked.push(capability);
    return access.allowed;
  },
}));

describe("RequireCapability", () => {
  it("shows a 403 state instead of the screen when the capability is missing", () => {
    access.allowed = false;
    const html = renderToStaticMarkup(
      <RequireCapability capability="audit.read">
        <p>secret screen</p>
      </RequireCapability>,
    );
    expect(html).toContain('data-testid="forbidden-state"');
    expect(html).toContain('data-status="403"');
    expect(html).not.toContain("secret screen");
  });

  it("renders the screen when the capability is held, and asks for exactly what was declared", () => {
    access.allowed = true;
    access.asked = [];
    const html = renderToStaticMarkup(
      <RequireCapability capability={["admin.users", "admin.roles"]}>
        <p>admin screen</p>
      </RequireCapability>,
    );
    expect(html).toContain("admin screen");
    expect(html).not.toContain("forbidden-state");
    expect(access.asked).toEqual([["admin.users", "admin.roles"]]);
  });
});

describe("Can", () => {
  it("renders children when allowed and the fallback otherwise", () => {
    access.allowed = true;
    expect(renderToStaticMarkup(<Can capability="note.sign" fallback="no">yes</Can>)).toBe("yes");
    access.allowed = false;
    expect(renderToStaticMarkup(<Can capability="note.sign" fallback="no">yes</Can>)).toBe("no");
    expect(renderToStaticMarkup(<Can capability="note.sign">yes</Can>)).toBe("");
  });
});

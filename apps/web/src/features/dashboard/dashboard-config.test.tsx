import { describe, expect, it } from "vitest";
import { WORKSPACES } from "@/lib/workspaces";
import { DASHBOARDS } from "./dashboard-config";

describe("dashboards", () => {
  it("exist for every workspace that lands on /dashboard, and for no unknown workspace", () => {
    const landing = WORKSPACES.filter((workspace) => workspace.home === "/dashboard").map((workspace) => workspace.key);
    expect(Object.keys(DASHBOARDS).sort()).toEqual([...landing].sort());
  });

  it("give each dashboard a subtitle, tiles and panels", () => {
    for (const [key, config] of Object.entries(DASHBOARDS)) {
      expect(config.description.length, key).toBeGreaterThan(0);
      expect(config.stats.length, key).toBeGreaterThan(0);
      expect(config.main.length, key).toBeGreaterThan(0);
    }
  });
});

import { CAPABILITY_CATALOG } from "@asc/types/capability";
import type { RoleKey, RoleTemplate } from "@asc/types";

export interface RoleRegistry {
  get(key: RoleKey): RoleTemplate | undefined;
  all(): readonly RoleTemplate[];
}

const CATALOG_KEYS: ReadonlySet<string> = new Set(CAPABILITY_CATALOG.map((entry) => entry.key));

// Role templates are repo-defined data (D-A6). Loading validates them once at
// startup so a bad template fails the process, never a request.
export function createRoleRegistry(templates: readonly RoleTemplate[]): RoleRegistry {
  const byKey = new Map<RoleKey, RoleTemplate>();
  for (const template of templates) {
    if (template.key.length === 0) throw new Error("Role template has an empty key");
    if (byKey.has(template.key)) throw new Error(`Duplicate role template key: ${template.key}`);
    if (!Number.isInteger(template.version) || template.version < 1) {
      throw new Error(`Role template ${template.key} needs a positive integer version`);
    }
    for (const capability of template.capabilities) {
      if (!CATALOG_KEYS.has(capability)) {
        throw new Error(`Role template ${template.key} lists unknown capability: ${capability}`);
      }
    }
    byKey.set(template.key, template);
  }
  return {
    get: (key) => byKey.get(key),
    all: () => [...byKey.values()],
  };
}

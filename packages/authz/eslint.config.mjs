import { config } from "@asc/eslint-config/base";

// Pure authorization core shared by apps/web, apps/api, apps/worker and bots: no I/O.
// Role names live here (templates), so the role-name guard is off for this package.
export default [...config, { rules: { "asc/no-role-name-comparison": "off" } }];

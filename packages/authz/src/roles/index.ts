import { createRoleRegistry } from "@asc/authz/roles/registry";
import { admin } from "@asc/authz/roles/admin";
import { anesthesia } from "@asc/authz/roles/anesthesia";
import { auditor } from "@asc/authz/roles/auditor";
import { circulatingNurse } from "@asc/authz/roles/circulating-nurse";
import { coder } from "@asc/authz/roles/coder";
import { frontDesk } from "@asc/authz/roles/front-desk";
import { giPhysician } from "@asc/authz/roles/gi-physician";
import { pacuNurse } from "@asc/authz/roles/pacu-nurse";
import { patient } from "@asc/authz/roles/patient";
import { preopNurse } from "@asc/authz/roles/preop-nurse";
import { rn } from "@asc/authz/roles/rn";
import { tech } from "@asc/authz/roles/tech";

export { preopNurse } from "@asc/authz/roles/preop-nurse";
export { circulatingNurse } from "@asc/authz/roles/circulating-nurse";
export { pacuNurse } from "@asc/authz/roles/pacu-nurse";

// D-A7 role list + specialized nursing roles (REQ-3:86-88).
export const ROLE_TEMPLATES = [
  frontDesk,
  rn,
  preopNurse,
  circulatingNurse,
  pacuNurse,
  tech,
  giPhysician,
  anesthesia,
  coder,
  admin,
  auditor,
  patient,
];

export const roleRegistry = createRoleRegistry(ROLE_TEMPLATES);

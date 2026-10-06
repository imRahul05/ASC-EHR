import { createRoleRegistry } from "@asc/authz/roles/registry";
import { admin } from "@asc/authz/roles/admin";
import { anesthesia } from "@asc/authz/roles/anesthesia";
import { auditor } from "@asc/authz/roles/auditor";
import { coder } from "@asc/authz/roles/coder";
import { frontDesk } from "@asc/authz/roles/front-desk";
import { giPhysician } from "@asc/authz/roles/gi-physician";
import { patient } from "@asc/authz/roles/patient";
import { rn } from "@asc/authz/roles/rn";
import { tech } from "@asc/authz/roles/tech";

// D-A7 role list.
export const ROLE_TEMPLATES = [frontDesk, rn, tech, giPhysician, anesthesia, coder, admin, auditor, patient];

export const roleRegistry = createRoleRegistry(ROLE_TEMPLATES);

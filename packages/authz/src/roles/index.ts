import { createRoleRegistry } from "./registry";
import { admin } from "./admin";
import { anesthesia } from "./anesthesia";
import { auditor } from "./auditor";
import { coder } from "./coder";
import { frontDesk } from "./front-desk";
import { giPhysician } from "./gi-physician";
import { patient } from "./patient";
import { rn } from "./rn";
import { tech } from "./tech";

// D-A7 role list.
export const ROLE_TEMPLATES = [frontDesk, rn, tech, giPhysician, anesthesia, coder, admin, auditor, patient];

export const roleRegistry = createRoleRegistry(ROLE_TEMPLATES);

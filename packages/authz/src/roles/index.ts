import { createRoleRegistry } from "./registry.js";
import { admin } from "./admin.js";
import { anesthesia } from "./anesthesia.js";
import { auditor } from "./auditor.js";
import { coder } from "./coder.js";
import { frontDesk } from "./front-desk.js";
import { giPhysician } from "./gi-physician.js";
import { patient } from "./patient.js";
import { rn } from "./rn.js";
import { tech } from "./tech.js";

// D-A7 role list.
export const ROLE_TEMPLATES = [frontDesk, rn, tech, giPhysician, anesthesia, coder, admin, auditor, patient];

export const roleRegistry = createRoleRegistry(ROLE_TEMPLATES);

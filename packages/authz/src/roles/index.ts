import { createRoleRegistry } from "./registry.js";
import { anesthesia } from "./anesthesia.js";
import { frontDesk } from "./front-desk.js";
import { giPhysician } from "./gi-physician.js";
import { rn } from "./rn.js";
import { tech } from "./tech.js";

export const ROLE_TEMPLATES = [frontDesk, rn, tech, giPhysician, anesthesia];

export const roleRegistry = createRoleRegistry(ROLE_TEMPLATES);

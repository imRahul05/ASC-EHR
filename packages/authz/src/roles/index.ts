import { createRoleRegistry } from "./registry.js";
import { frontDesk } from "./front-desk.js";
import { rn } from "./rn.js";
import { tech } from "./tech.js";

export const ROLE_TEMPLATES = [frontDesk, rn, tech];

export const roleRegistry = createRoleRegistry(ROLE_TEMPLATES);

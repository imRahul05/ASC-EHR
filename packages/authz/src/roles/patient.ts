import type { RoleTemplate } from "@asc/types";
import { ro, rw } from "./rules";

// Portal role (P2). A patient never receives a staff capability; the
// principal kind and can() enforce that independently of this template.
export const patient: RoleTemplate = {
  key: "patient",
  version: 1,
  label: "Patient",
  status: "active",
  capabilities: ["portal.self.read", "portal.self.forms"],
  data: [ro("Patient"), ro("Appointment"), rw("QuestionnaireResponse")],
  facilityScoped: false,
  requiresMfa: false,
};

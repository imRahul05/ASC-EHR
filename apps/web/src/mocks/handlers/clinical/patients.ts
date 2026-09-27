import { holdRuleFor } from "@asc/clinical-rules";
import { API_ROUTE_PATTERNS as P } from "@asc/config/api";
import type {
  ConvertReferralPayload,
  CreatePatientPayload,
  DuplicateCheckPayload,
  DuplicateMatch,
  EligibilityResult,
  Patient,
  PatientListItem,
  UpdateEscortPayload,
} from "@asc/types";
import { http, HttpResponse } from "msw";
import { actorFrom, addWorkItem, audit, completeWorkItems, db, patientListItem } from "../../db/store";
import { newId } from "../../db/util";
import { apiUrl } from "../api-url";
import { apiError, body, latency, notFound, param } from "./respond";

function matchesQuery(item: PatientListItem, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return [item.displayName, item.mrn, item.dateOfBirth, item.phone].some((value) => value.toLowerCase().includes(needle));
}

export function searchPatients(q: string): PatientListItem[] {
  return [...db().patients.keys()]
    .map(patientListItem)
    .filter((item): item is PatientListItem => item !== null)
    .filter((item) => matchesQuery(item, q))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

function createPatientRecord(payload: CreatePatientPayload): Patient {
  const state = db();
  const index = state.patients.size + 1;
  const patient: Patient = {
    id: newId("pat"),
    mrn: `MRN-${204_310 + index * 17 + 3}`,
    firstName: payload.firstName,
    lastName: payload.lastName,
    dateOfBirth: payload.dateOfBirth,
    sex: payload.sex,
    phone: payload.phone,
    ...(payload.email ? { email: payload.email } : {}),
    ...(payload.address ? { address: payload.address } : {}),
    preferredLanguage: payload.preferredLanguage ?? "English",
    coverage: payload.coverage ? { ...payload.coverage, id: newId("cov"), eligibility: null } : null,
    escort: payload.escort ? { ...payload.escort, present: false } : null,
    allergies: (payload.allergies ?? []).map((allergy) => ({ ...allergy, id: newId("alg") })),
    medications: (payload.medications ?? []).map((med) => {
      const holdRule = holdRuleFor(med.medClass);
      return { ...med, id: newId("med"), holdRule, holdStatus: holdRule ? "pending" : "not_required" };
    }),
    ...(payload.referringProvider ? { referringProvider: payload.referringProvider } : {}),
    createdAt: new Date().toISOString(),
  };
  state.patients.set(patient.id, patient);
  return patient;
}

function duplicateMatches(payload: DuplicateCheckPayload): DuplicateMatch[] {
  const last = payload.lastName.trim().toLowerCase();
  const first = payload.firstName.trim().toLowerCase();
  return [...db().patients.values()]
    .map((patient) => {
      const reasons = [
        ...(patient.lastName.toLowerCase() === last ? ["Same last name"] : []),
        ...(patient.firstName.toLowerCase() === first ? ["Same first name"] : []),
        ...(patient.dateOfBirth === payload.dateOfBirth ? ["Same date of birth"] : []),
      ];
      return { patient, reasons, score: reasons.length / 3 };
    })
    .filter((match) => match.score >= 2 / 3)
    .flatMap(({ patient, reasons, score }): DuplicateMatch[] => {
      const item = patientListItem(patient.id);
      return item ? [{ patient: item, reasons, score: Math.round(score * 100) / 100 }] : [];
    })
    .sort((a, b) => b.score - a.score);
}

export const patientHandlers = [
  http.get(apiUrl(P.patients), async ({ request }) => {
    await latency();
    return HttpResponse.json(searchPatients(new URL(request.url).searchParams.get("q") ?? ""));
  }),

  http.post(apiUrl(P.patientDuplicateCheck), async ({ request }) => {
    await latency();
    return HttpResponse.json({ matches: duplicateMatches(await body<DuplicateCheckPayload>(request)) });
  }),

  http.post(apiUrl(P.patients), async ({ request }) => {
    await latency();
    const payload = await body<CreatePatientPayload>(request);
    if (!payload.firstName || !payload.lastName || !payload.dateOfBirth) {
      return apiError(400, "VALIDATION_FAILED", "First name, last name and date of birth are required.");
    }
    const patient = createPatientRecord(payload);
    audit(actorFrom(request), "patient.create", { type: "Patient", id: patient.id }, `Registered patient ${patient.mrn}`);
    return HttpResponse.json(patient, { status: 201 });
  }),

  http.get(apiUrl(P.patient), async ({ params }) => {
    await latency();
    const patient = db().patients.get(param(params.patientId));
    return patient ? HttpResponse.json(patient) : notFound("Patient");
  }),

  http.post(apiUrl(P.patientEligibility), async ({ params, request }) => {
    await latency();
    const state = db();
    const patient = state.patients.get(param(params.patientId));
    if (!patient) return notFound("Patient");
    if (!patient.coverage) return apiError(422, "COVERAGE_MISSING", "Add coverage before checking eligibility.");
    const result: EligibilityResult = {
      status: "active",
      checkedAt: new Date().toISOString(),
      copayCents: 0,
      deductibleRemainingCents: 32_500,
      message: "Active coverage — colonoscopy benefit confirmed (mock 271).",
      transactionId: newId("X12-271"),
    };
    state.patients.set(patient.id, { ...patient, coverage: { ...patient.coverage, eligibility: result } });
    for (const item of state.cases.values()) {
      if (item.patientId === patient.id) state.cases.set(item.id, { ...item, readiness: { ...item.readiness, eligibilityActive: true } });
    }
    completeWorkItems((item) => item.type === "eligibility_failed" && item.patientId === patient.id);
    audit(actorFrom(request), "eligibility.check", { type: "Coverage", id: patient.coverage.id }, "X12 270/271 eligibility: active");
    return HttpResponse.json(result);
  }),

  http.put(apiUrl(P.patientEscort), async ({ params, request }) => {
    await latency();
    const state = db();
    const patient = state.patients.get(param(params.patientId));
    if (!patient) return notFound("Patient");
    const escort = await body<UpdateEscortPayload>(request);
    const updated: Patient = { ...patient, escort: { ...escort, present: patient.escort?.present ?? false } };
    state.patients.set(patient.id, updated);
    audit(actorFrom(request), "patient.escort.update", { type: "Patient", id: patient.id }, "Escort details updated");
    return HttpResponse.json(updated);
  }),

  http.get(apiUrl(P.referrals), async () => {
    await latency();
    const referrals = [...db().referrals.values()].sort((a, b) => Date.parse(b.receivedAt) - Date.parse(a.receivedAt));
    return HttpResponse.json(referrals);
  }),

  http.get(apiUrl(P.referral), async ({ params }) => {
    await latency();
    const referral = db().referrals.get(param(params.referralId));
    return referral ? HttpResponse.json(referral) : notFound("Referral");
  }),

  http.post(apiUrl(P.referralConvert), async ({ params, request }) => {
    await latency();
    const state = db();
    const referral = state.referrals.get(param(params.referralId));
    if (!referral) return notFound("Referral");
    if (referral.status === "converted") return apiError(409, "REFERRAL_ALREADY_CONVERTED", "This referral was already converted.");
    const payload = await body<ConvertReferralPayload>(request);
    const existing = payload.patientId ? state.patients.get(payload.patientId) : undefined;
    if (payload.patientId && !existing) return notFound("Patient");
    if (!existing && !payload.patient) return apiError(400, "VALIDATION_FAILED", "Provide patientId or patient details.");
    const patient = existing ?? createPatientRecord({ ...(payload.patient as CreatePatientPayload), referralId: referral.id });
    const updated = { ...referral, status: "converted" as const, patientId: patient.id };
    state.referrals.set(referral.id, updated);
    completeWorkItems((item) => item.type === "referral_intake" && item.referralId === referral.id);
    if (!patient.coverage?.eligibility) {
      addWorkItem({
        type: "eligibility_failed",
        title: `Verify eligibility — ${patient.mrn}`,
        detail: "New patient from referral; run 270/271 before booking.",
        ownerRole: "ADMIN",
        priority: "normal",
        dueAt: new Date(Date.now() + 4 * 3_600_000).toISOString(),
        patientId: patient.id,
      });
    }
    audit(actorFrom(request), "referral.convert", { type: "Referral", id: referral.id }, `Referral linked to ${patient.mrn}`);
    return HttpResponse.json({ referral: updated, patient });
  }),
];

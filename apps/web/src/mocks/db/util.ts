import { ageFromDob } from "@asc/clinical-rules";
import type { Patient, PatientRef, StaffRef } from "@asc/types";

const MINUTE_MS = 60_000;
const SLOT_MIN = 15;

let counter = 0;

/** Short unique id with a readable prefix (`vit_k3x9a`). */
export function newId(prefix: string): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36).slice(-4)}${counter.toString(36)}`;
}

/** Anchor of the demo day: now, floored to the 15-minute slot, so the live board is coherent at any hour. */
export function demoAnchor(now: Date = new Date()): number {
  const slot = SLOT_MIN * MINUTE_MS;
  return Math.floor(now.getTime() / slot) * slot;
}

export function isoAt(anchorMs: number, offsetMin: number): string {
  return new Date(anchorMs + offsetMin * MINUTE_MS).toISOString();
}

export function addMinutes(iso: string, minutes: number): string {
  return new Date(Date.parse(iso) + minutes * MINUTE_MS).toISOString();
}

export function initialsOf(name: string): string {
  return name
    .replace(/^(Dr\.|Mr\.|Ms\.|Mrs\.)\s+/, "")
    .split(/\s+/)
    .map((part) => part[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function patientRef(patient: Patient): PatientRef {
  const displayName = `${patient.firstName} ${patient.lastName}`;
  return {
    id: patient.id,
    mrn: patient.mrn,
    displayName,
    initials: initialsOf(displayName),
    age: ageFromDob(patient.dateOfBirth),
    sex: patient.sex,
    dateOfBirth: patient.dateOfBirth,
  };
}

export function staffRef(member: StaffRef): StaffRef {
  return { id: member.id, name: member.name, initials: member.initials };
}

/** Deterministic PRNG (mulberry32) so seeded history looks the same on every reset. */
export function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const LATENCY_MIN_MS = 150;
const LATENCY_MAX_MS = 400;

/** Realistic API latency for the mock (150–400 ms). */
export function latencyMs(): number {
  return LATENCY_MIN_MS + Math.round(Math.random() * (LATENCY_MAX_MS - LATENCY_MIN_MS));
}

/**
 * AIMS Vitals Monitoring Intervals & Adequacy Engine.
 *
 * US Healthcare Regulations & Clinical Standards:
 * - ASA Standards for Basic Anesthetic Monitoring (Amended October 2020):
 *   Basic anesthetic monitoring requires continuous evaluation of oxygenation (pulse oximetry),
 *   ventilation (continuous EtCO2 capnography from sedation start to end), and circulation (arterial blood pressure
 *   and heart rate at least every 5 minutes).
 * - CMS 42 CFR § 416.42(a) Condition for Coverage: Surgical and Anesthesia Services.
 */

import type { RuleResult, VitalsEntry } from "@asc/types";
import { fromChecks, OK } from "@asc/clinical-rules/result";

export interface MonitoringGap {
  readonly startIso: string;
  readonly endIso: string;
  readonly gapDurationMinutes: number;
  readonly reason?: string;
}

/**
 * Evaluates chronological vitals entries and identifies any gaps exceeding the ASA 5-minute threshold.
 *
 * @param vitals - Vitals recorded during the procedure.
 * @param sedationStartIso - ISO timestamp when procedural sedation was initiated.
 * @param sedationEndIso - ISO timestamp when procedural sedation was terminated.
 * @param maxGapMinutes - Maximum allowed gap before warning (defaults to ASA 5-minute standard).
 */
export function findMonitoringGaps(
  vitals: readonly VitalsEntry[],
  sedationStartIso?: string,
  sedationEndIso?: string,
  maxGapMinutes = 5,
): readonly MonitoringGap[] {
  if (!sedationStartIso && vitals.length === 0) {
    return [];
  }

  const maxGapMs = maxGapMinutes * 60_000;
  const gaps: MonitoringGap[] = [];

  // Sort vitals chronologically
  const sortedVitals = [...vitals].sort((a, b) => {
    const timeA = Date.parse(a.recordedAt);
    const timeB = Date.parse(b.recordedAt);
    return timeA - timeB;
  });

  const startMs = sedationStartIso ? Date.parse(sedationStartIso) : undefined;
  const endMs = sedationEndIso ? Date.parse(sedationEndIso) : undefined;

  // Filter vitals within sedation window if bounds are provided
  const intraVitals = sortedVitals.filter((v) => {
    const vTime = Date.parse(v.recordedAt);
    if (isNaN(vTime)) return false;
    if (startMs !== undefined && !isNaN(startMs) && vTime < startMs) return false;
    if (endMs !== undefined && !isNaN(endMs) && vTime > endMs) return false;
    return true;
  });

  // If no vitals recorded inside sedation window
  if (intraVitals.length === 0) {
    if (startMs !== undefined && !isNaN(startMs) && sedationStartIso) {
      const effectiveEndMs = endMs !== undefined && !isNaN(endMs) ? endMs : Date.now();
      const effectiveEndIso = sedationEndIso ?? new Date(effectiveEndMs).toISOString();
      const elapsedMs = effectiveEndMs - startMs;
      if (elapsedMs > maxGapMs) {
        const gapDurationMinutes = Math.round((elapsedMs / 60_000) * 10) / 10;
        gaps.push({
          startIso: sedationStartIso,
          endIso: effectiveEndIso,
          gapDurationMinutes,
          reason: "No vitals recorded since sedation start",
        });
      }
    }
    return gaps;
  }

  // Check gap between sedation start and first recorded vital
  const firstVital = intraVitals[0];
  if (startMs !== undefined && !isNaN(startMs) && sedationStartIso && firstVital) {
    const firstVitalMs = Date.parse(firstVital.recordedAt);
    const initialGapMs = firstVitalMs - startMs;
    if (initialGapMs > maxGapMs) {
      const gapDurationMinutes = Math.round((initialGapMs / 60_000) * 10) / 10;
      gaps.push({
        startIso: sedationStartIso,
        endIso: firstVital.recordedAt,
        gapDurationMinutes,
        reason: "Initial vitals documentation delayed after sedation start",
      });
    }
  }

  // Check gaps between consecutive vitals
  for (let i = 0; i < intraVitals.length - 1; i++) {
    const current = intraVitals[i];
    const next = intraVitals[i + 1];
    if (!current || !next) continue;

    const currentMs = Date.parse(current.recordedAt);
    const nextMs = Date.parse(next.recordedAt);

    if (isNaN(currentMs) || isNaN(nextMs)) continue;

    const deltaMs = nextMs - currentMs;
    if (deltaMs > maxGapMs) {
      const gapDurationMinutes = Math.round((deltaMs / 60_000) * 10) / 10;
      gaps.push({
        startIso: current.recordedAt,
        endIso: next.recordedAt,
        gapDurationMinutes,
        reason: `Exceeded ASA ${maxGapMinutes}-minute interval between vital checks`,
      });
    }
  }

  // Check gap between last vital and sedation end (if procedure has ended)
  const lastVital = intraVitals[intraVitals.length - 1];
  if (endMs !== undefined && !isNaN(endMs) && sedationEndIso && lastVital) {
    const lastVitalMs = Date.parse(lastVital.recordedAt);
    const terminalGapMs = endMs - lastVitalMs;
    if (terminalGapMs > maxGapMs) {
      const gapDurationMinutes = Math.round((terminalGapMs / 60_000) * 10) / 10;
      gaps.push({
        startIso: lastVital.recordedAt,
        endIso: sedationEndIso,
        gapDurationMinutes,
        reason: "Vitals documentation ceased more than 5 minutes prior to sedation end",
      });
    }
  }

  return gaps;
}

/**
 * Evaluates vitals adequacy against ASA basic monitoring requirements.
 *
 * @param vitals - Vitals recorded during the case.
 * @param sedationStartIso - Timestamp when sedation started.
 * @param sedationEndIso - Timestamp when sedation ended.
 */
export function evaluateVitalsAdequacy(
  vitals: readonly VitalsEntry[],
  sedationStartIso?: string,
  sedationEndIso?: string,
): RuleResult {
  // If sedation has not started, vitals adequacy checks are non-blocking
  if (!sedationStartIso) {
    return OK;
  }

  const gaps = findMonitoringGaps(vitals, sedationStartIso, sedationEndIso, 5);
  const hasVitals = vitals.length > 0;
  const hasEtco2 = vitals.some((v) => typeof v.etco2 === "number" && v.etco2 > 0);
  const hasSpo2 = vitals.every((v) => typeof v.spo2 === "number" && v.spo2 >= 50);

  return fromChecks([
    {
      code: "ASA_VITALS_RECORDED",
      label: "Sedation vitals documented",
      ok: hasVitals,
      message: hasVitals ? "" : "No vitals documented for active sedation case.",
    },
    {
      code: "ASA_5MIN_INTERVALS",
      label: "Vitals recorded every 5 minutes (ASA standard)",
      ok: gaps.length === 0,
      message:
        gaps.length === 0
          ? ""
          : `Monitoring gap detected: ${gaps.length} interval(s) exceeded 5 minutes (max ${Math.max(...gaps.map((g) => g.gapDurationMinutes))} min).`,
    },
    {
      code: "ASA_OXYGENATION_MONITORED",
      label: "Continuous pulse oximetry (SpO2)",
      ok: hasSpo2 && hasVitals,
      message: hasSpo2 && hasVitals ? "" : "Missing or invalid SpO2 documentation on vital readings.",
    },
    {
      code: "ASA_VENTILATION_ETCO2",
      label: "Continuous EtCO2 capnography ventilation",
      ok: hasEtco2,
      message: hasEtco2 ? "" : "ASA standard requires continuous EtCO2 capnography during sedation.",
    },
  ]);
}

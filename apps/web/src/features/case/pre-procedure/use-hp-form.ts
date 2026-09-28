"use client";

import { useForm } from "react-hook-form";
import type { AsaClass, HpAssessment, Mallampati } from "@asc/types";

type HpFormValues = {
  intervalHistory: string;
  heart: string;
  lungs: string;
  airwayNotes: string;
  asa: AsaClass | null;
  mallampati: Mallampati | null;
};

function toValues(hp: HpAssessment | null): HpFormValues {
  return {
    intervalHistory: hp?.intervalHistory ?? "",
    heart: hp?.heart ?? "",
    lungs: hp?.lungs ?? "",
    airwayNotes: hp?.airwayNotes ?? "",
    asa: hp?.asa ?? null,
    mallampati: hp?.mallampati ?? null,
  };
}

/**
 * H&P form state (react-hook-form owns the values). `values` keeps it in sync with the server copy
 * after every save; fields the clinician is still editing are kept (keepDirtyValues).
 */
export function useHpForm(hp: HpAssessment | null) {
  return useForm<HpFormValues>({ values: toValues(hp), resetOptions: { keepDirtyValues: true } });
}

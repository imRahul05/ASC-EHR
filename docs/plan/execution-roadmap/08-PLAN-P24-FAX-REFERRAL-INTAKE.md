# Plan 08 — `P24`: inbound fax, referral classification and extraction, urgent triage, outbound fax and the eCW bridge (EP-B: US-B-01..04, 09, 10, 11)

> **Branch:** `phase/P24-fax-referral` · **Depends on:** P12 (Task engine), P10 optional (SSE inbox refresh; polling is fine otherwise)
> **External blockers:** Q-MS4 (faxagnet access) and Q-MS5 (eCW / Integuru). Build **behind adapters with stub implementations** so nothing waits on them. Open/refresh GitHub issues per AGENTS.md #7.
> **What already exists:** referral UI `apps/web/src/features/referrals/*` (inbox, detail with `SourceDocument` highlight, actions, prefill); types `Referral`, `ExtractedFact`, `SourceSpan`, `ConvertReferralPayload`; client hooks `useReferrals`, `useReferral`, `useConvertReferral`, `useDuplicateCheck`; route patterns `referrals`, `referral`, `referralConvert`, `patientDuplicateCheck`. Capabilities: `referral.triage`, `fax.send`, `patient.register`, `ai.generate`.
> **Missing:** API routes, agent, worker jobs, adapters, DB ledger.

## Guardrails
Standard (see the other plans). PHI: fax PDFs live **only** in Medplum `Binary` (BAA). There is no PHI in Postgres, logs or queue payloads (ids only). Citations: **HIPAA §164.312(e)** (transmission security), **HIPAA §164.530(c)** (fax safeguards: cover sheet, verified number), **CMS 42 CFR §416.52(a)** (pre-admission assessment information), **TCPA 47 U.S.C. §227(b)(1)(C)** (no unsolicited fax advertising; clinical only).

## C1 `feat(config,validation): fax/referral contracts + flags`
- `packages/config/src/flags.ts`: `FAX_INBOUND`, `FAX_OUTBOUND`, `ECW_READ`, `ECW_WRITEBACK` (default off).
- `packages/validation/src/referral.ts`: `faxInboundWebhookSchema` (HMAC header verified separately), `referralClassificationSchema` (`referral|clinical_records|junk` + confidence), `referralExtractionSchema` (facts with `sourceSpan` and **bounding box** `{page,x,y,w,h}` for US-B-03), `convertReferralSchema`, `outboundFaxSchema`. Extend the `SourceSpan` type with an optional `bbox`.

## C2 `feat(clinical-rules): urgent triage + completeness`
- `referral/urgency.ts` (US-B-04): keyword/indication rules (GI bleed, melena with Hgb drop, suspected malignancy/mass, obstruction, food impaction) → `urgent`, plus a `stat` `referral_intake` work item due in **1 hour**.
- `referral/completeness.ts` (US-B-11): missing demographics, insurance, H&P or indication → `records_request` work item + an outbound fax template id.

## C3 `feat(agents): referral-extract agent`
`packages/agents/src/agents/referral-extract/` (`Task.DataExtraction`, BAA-routed because the input contains PHI): it classifies and extracts the facts with spans, abstains when OCR text is too short, and has ≥3 evals (clean referral, multi-page with insurance card, junk fax). Register it.

## C4 `feat(api,worker): fax inbox + referral routes`
- Adapter port `apps/api/src/integrations/fax/fax-adapter.ts` (`FaxAdapter { listInbound; fetchDocument; send }`) with a `stub-fax-adapter.ts` (reads seed PDFs) and a `faxagnet-adapter.ts` that is only loaded when the flag and env are set.
- `apps/api/src/routes/referrals.ts`: `POST /fax/inbound` (webhook, HMAC verified → `Binary` + `DocumentReference` → enqueue extract), `GET /referrals`, `GET /referrals/:id`, `PATCH /referrals/:id/facts` (human correction, Provenance), `POST /referrals/:id/convert` (duplicate-check reuse, creates `ServiceRequest` with referring NPI (US-B-09), links Patient, completes the `referral_intake` Task), `POST /referrals/:id/reject`, `POST /fax/outbound` (`fax.send`, cover sheet, number on the verified directory list).
- `apps/worker/src/jobs/referral-extract/index.ts`: OCR text (stub = embedded text layer) → agent → urgency/completeness rules → `Task`s.
- Tests: webhook HMAC rejection, urgent triage within 1 h, convert idempotency, tenant isolation.

## C5 `feat(db,worker): eCW bridge (flagged, stubbed)`
- `packages/db/src/schema/writeback-ledger.ts` (+ migration, tenant column): exactly-once write-back keyed by `(tenant, caseId, artifact)`, with **no PHI** (ids and hashes only).
- `apps/worker/src/jobs/ecw-writeback/index.ts`: after a note is signed or a pathology letter is ready, push to the eCW adapter (stub) only if the ledger row is absent.

## C6 `feat(web): wire inbox`
Point the existing referral UI at the real routes, add a bbox overlay on `SourceDocument`, an urgent banner with a countdown, and an outbound fax dialog on letters (P23). Update MSW lockstep and `PROGRESS.md`.

## Done when
All gates pass, `pnpm eval` passes, and the seed fax flows end to end: fax → extraction → urgent stat Task appears on `/worklist` → convert → book case.

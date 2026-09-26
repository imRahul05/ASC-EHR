# create-agent templates

Derived from `packages/agents/src/agents/discharge-instructions/`. Replace `referral-letter` / `referralLetter` / `ReferralLetter` with your agent. If the real files have moved on from these snippets, copy the real files - they win.

All paths relative to `packages/agents/src/agents/<name>/` unless stated.

## input.ts

```typescript
/**
 * Input for the referral-letter agent - the minimum necessary facts, as closed
 * enums / numbers / booleans. No names, DOB, MRN, addresses or free text, and
 * `.strict()` rejects any extra field, so identifiers cannot slip in.
 */

import { z } from 'zod';

const procedureSchema = z.enum(['colonoscopy', 'egd', 'flexible-sigmoidoscopy']);

const findingsSchema = z
  .object({
    polypsRemoved: z.number().int().min(0).max(50),
    biopsiesTaken: z.boolean(),
  })
  .strict();

/** Clinician decision, passed through - the agent never chooses it. */
const followUpSchema = z.enum(['as-needed', 'clinic-2-weeks', 'repeat-procedure-3-years']);

export const referralLetterInputSchema = z
  .object({
    procedures: z.array(procedureSchema).min(1).max(3),
    findings: findingsSchema,
    followUp: followUpSchema,
  })
  .strict();

export type ReferralLetterInput = z.infer<typeof referralLetterInputSchema>;
```

## prompt.ts

```typescript
/**
 * Prompt for the referral-letter agent.
 *
 * REQUIRES CLINICAL REVIEW BEFORE PRODUCTION USE. Bump PROMPT_VERSION on any
 * change to INSTRUCTIONS or buildMessages.
 */

import type { ModelMessage } from 'ai';

import type { ReferralLetterInput } from './input.js';

export const PROMPT_VERSION = '2026-09-26.1'; // YYYY-MM-DD.N

export const INSTRUCTIONS = `You draft ...

Rules:
- Use ONLY the facts in the user message. Do not add diagnoses or guesses.
- Do not include any names or identifiers.
- Return JSON that matches the provided schema exactly.`;

type Input = ReferralLetterInput;

const PROCEDURE: Record<Input['procedures'][number], string> = {
  colonoscopy: 'colonoscopy',
  egd: 'upper endoscopy (EGD)',
  'flexible-sigmoidoscopy': 'flexible sigmoidoscopy',
};

const FOLLOW_UP: Record<Input['followUp'], string> = {
  'as-needed': 'as needed',
  'clinic-2-weeks': 'clinic visit in about 2 weeks',
  'repeat-procedure-3-years': 'repeat procedure in about 3 years',
};

const yesNo = (value: boolean): string => (value ? 'yes' : 'no');

/** Renders each allowed field explicitly (never the raw object). */
export function buildMessages(input: Input): ModelMessage[] {
  const { findings } = input;
  // Derived facts are decided in code, not by the model.
  const tissueSent = findings.biopsiesTaken || findings.polypsRemoved > 0;

  const facts = [
    `Procedures: ${input.procedures.map((p) => PROCEDURE[p]).join('; ')}`,
    `Polyps removed: ${findings.polypsRemoved}`,
    `Biopsies taken: ${yesNo(findings.biopsiesTaken)}`,
    `Tissue sent for lab testing: ${yesNo(tissueSent)}`,
    `Follow-up: ${FOLLOW_UP[input.followUp]}`,
  ];

  return [{ role: 'user', content: `Draft the letter from these facts:\n${facts.map((f) => `- ${f}`).join('\n')}` }];
}
```

## definition.ts

```typescript
import { referralLetterOutputSchema } from '@asc/validation';

import { Task } from '../../config/index.js';
import { defineAgent } from '../define.js';
import { referralLetterInputSchema } from './input.js';
import { INSTRUCTIONS, PROMPT_VERSION, buildMessages } from './prompt.js';

/** Output is a DRAFT for clinician review. */
export const referralLetterAgent = defineAgent({
  name: 'referral-letter',
  description: 'Procedure summary letter for the referring physician.',
  task: Task.PatientInstructions, // or a new Task added in config/tasks.ts
  // reasoning / models / requires: only with a written reason
  promptVersion: PROMPT_VERSION,
  input: referralLetterInputSchema,
  output: referralLetterOutputSchema,
  instructions: INSTRUCTIONS,
  buildMessages,
});
```

## index.ts

```typescript
export { referralLetterAgent } from './definition.js';
export { referralLetterInputSchema, type ReferralLetterInput } from './input.js';
```

## agents/registry.ts (one line + import)

```typescript
import { referralLetterAgent } from './referral-letter/index.js';

export const AGENTS = {
  [dischargeInstructionsAgent.name]: dischargeInstructionsAgent,
  [referralLetterAgent.name]: referralLetterAgent,
} as const satisfies Record<string, AnyAgentDefinition>;
```

## src/index.ts (public API)

```typescript
export {
  referralLetterAgent,
  referralLetterInputSchema,
  type ReferralLetterInput,
} from './agents/referral-letter/index.js';
```

## packages/validation/src/agents/referral-letter.ts

```typescript
// @asc/validation uses double quotes; match the package's formatting.
import { z } from "zod";

const lines = z.array(z.string().min(1)).min(1);

export const referralLetterOutputSchema = z.object({
  summary: z.string().min(1),
  findings: lines,
  recommendations: lines,
});

export type ReferralLetterOutput = z.infer<typeof referralLetterOutputSchema>;
```

Then expose it from `packages/validation/src/index.ts` the same way existing agent outputs are exposed.

## evals/cases.ts

```typescript
/** Synthetic eval cases (no real patient data). */

import type { ReferralLetterOutput } from '@asc/validation';

import type { AgentEvalCase } from '../../define.js';
import type { ReferralLetterInput } from '../input.js';

type Case = AgentEvalCase<ReferralLetterInput, ReferralLetterOutput>;

export const referralLetterEvalCases: readonly Case[] = [
  {
    name: 'normal colonoscopy, routine follow-up',
    input: { procedures: ['colonoscopy'], findings: { polypsRemoved: 0, biopsiesTaken: false }, followUp: 'as-needed' },
    expectations: [{ description: 'has recommendations', check: (o) => o.recommendations.length > 0 }],
  },
  // + a case where a branch changes clinical content (polyps / biopsies -> pathology pending)
  // + an edge case (multiple procedures, boundary values, other language/reading level)
];
```

## __tests__/referral-letter.test.ts

Copy `discharge-instructions/__tests__/discharge-instructions.test.ts` and adapt: definition shape, strict input, `CANARY` smuggling in `buildMessages` (fact-line count, no `{`), derived facts, eval inputs parse, expectation pass/fail, `runAgent` SUCCESS round-trip with audit details sanitized, `AgentInputError` with no model call, FAILURE on schema mismatch and on provider error.

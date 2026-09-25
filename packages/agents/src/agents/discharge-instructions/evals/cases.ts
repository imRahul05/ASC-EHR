/**
 * Synthetic eval cases (no real patient data). Unit tests check the inputs
 * validate; a live-model eval runner (next step, see README) runs each case
 * through `runAgent` and applies the expectations to the real output.
 */

import type { DischargeInstructionsOutput } from '@repo/validation';

import type { AgentEvalCase } from '../../define.js';
import type { DischargeInstructionsInput } from '../input.js';

type DischargeEvalCase = AgentEvalCase<DischargeInstructionsInput, DischargeInstructionsOutput>;
type Expectation = DischargeEvalCase['expectations'][number];

const allText = (o: DischargeInstructionsOutput): string => JSON.stringify(o).toLowerCase();

const hasWarningSigns: Expectation = {
  description: 'warningSigns lists both clinic and emergency signs',
  check: (o) => o.warningSigns.callClinic.length > 0 && o.warningSigns.goToEmergency.length > 0,
};

const language = (expected: DischargeInstructionsOutput['language']): Expectation => ({
  description: `written in "${expected}"`,
  check: (o) => o.language === expected,
});

const pathologyPending = (expected: boolean): Expectation => ({
  description: `pathologyPending.pending is ${expected}`,
  check: (o) => o.pathologyPending.pending === expected,
});

export const dischargeInstructionsEvalCases: readonly DischargeEvalCase[] = [
  {
    name: 'screening colonoscopy, normal, no blood thinner',
    input: {
      procedures: ['colonoscopy'],
      sedation: 'monitored-anesthesia-care',
      findings: { polypsRemoved: 0, biopsiesTaken: false, hemostasisPerformed: false },
      anticoagulant: { plan: 'not-taking' },
      followUp: 'repeat-procedure-10-years',
      language: 'en',
      readingLevel: 'standard',
    },
    expectations: [
      hasWarningSigns,
      language('en'),
      pathologyPending(false),
      { description: 'no blood-thinner change invented', check: (o) => o.medications.every((m) => m.action === 'continue') },
    ],
  },
  {
    name: 'colonoscopy + EGD with polypectomy and biopsies, blood thinner held',
    input: {
      procedures: ['colonoscopy', 'egd'],
      sedation: 'moderate',
      findings: { polypsRemoved: 2, biopsiesTaken: true, hemostasisPerformed: true },
      anticoagulant: { plan: 'hold-until-contacted' },
      followUp: 'clinic-2-weeks',
      language: 'en',
      readingLevel: 'basic',
    },
    expectations: [
      hasWarningSigns,
      language('en'),
      pathologyPending(true),
      { description: 'blood thinner is held', check: (o) => o.medications.some((m) => m.action === 'hold') },
      { description: 'mentions not driving after sedation', check: (o) => allText(o).includes('driv') },
    ],
  },
  {
    name: 'flexible sigmoidoscopy with biopsy, Spanish, resume blood thinner in 2 days',
    input: {
      procedures: ['flexible-sigmoidoscopy'],
      sedation: 'none',
      findings: { polypsRemoved: 0, biopsiesTaken: true, hemostasisPerformed: false },
      anticoagulant: { plan: 'resume-after-days', days: 2 },
      followUp: 'clinic-6-weeks',
      language: 'es',
      readingLevel: 'basic',
    },
    expectations: [
      hasWarningSigns,
      language('es'),
      pathologyPending(true),
      { description: 'blood thinner is resumed', check: (o) => o.medications.some((m) => m.action === 'resume') },
    ],
  },
];

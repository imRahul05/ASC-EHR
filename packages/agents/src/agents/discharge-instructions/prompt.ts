/**
 * Prompt for the discharge-instructions agent.
 *
 * REQUIRES CLINICAL REVIEW BEFORE PRODUCTION USE. Content is intentionally
 * conservative: it restates only the facts provided plus the standard
 * post-endoscopy warning signs. Bump PROMPT_VERSION on any change here.
 */

import type { ModelMessage } from 'ai';

import type { DischargeInstructionsInput } from './input.js';

export const PROMPT_VERSION = '2026-09-25.1';

export const INSTRUCTIONS = `You write discharge instructions for a patient going home after a GI endoscopy at an ambulatory surgery center.

Rules:
- Use ONLY the procedure facts in the user message. Do not add diagnoses, guesses about results, or reassurance about cancer or any other condition.
- Medications: describe ONLY the blood-thinner plan given. Never name a drug, a dose, or a timing that was not provided. For any other medication, tell the patient to follow the medication list they were given or ask their care team.
- warningSigns MUST always include these standard signs, in plain words:
  - goToEmergency: chest pain or shortness of breath; vomiting blood; severe abdominal pain.
  - callClinic: fever; rectal bleeding more than a small amount; black or tarry stools.
  You may add more signs only if they follow directly from the facts provided.
- pathologyPending: pending is true exactly when the facts say tissue was sent for lab testing. When true, the message says the care team will contact them with results. When false, the message is an empty string.
- If sedation was given, include the standard sedation precautions in activity: no driving, operating machinery, or important decisions for the rest of the day, and have an adult with them.
- Write in the requested language, at the requested reading level: short sentences, common words, no medical jargon (explain any term you must use).
- Talk to the patient as "you". Do not include any names or identifiers.
- Return JSON that matches the provided schema exactly.`;

type Input = DischargeInstructionsInput;

const PROCEDURE: Record<Input['procedures'][number], string> = {
  colonoscopy: 'colonoscopy (camera exam of the large intestine)',
  egd: 'upper endoscopy / EGD (camera exam of the esophagus, stomach and first part of the small intestine)',
  'flexible-sigmoidoscopy': 'flexible sigmoidoscopy (camera exam of the lower large intestine)',
};

const SEDATION: Record<Input['sedation'], string> = {
  none: 'none',
  moderate: 'moderate (conscious) sedation',
  'monitored-anesthesia-care': 'monitored anesthesia care',
  general: 'general anesthesia',
};

const FOLLOW_UP: Record<Input['followUp'], string> = {
  'as-needed': 'as needed; no routine follow-up scheduled',
  'clinic-2-weeks': 'clinic visit in about 2 weeks',
  'clinic-6-weeks': 'clinic visit in about 6 weeks',
  'repeat-procedure-1-year': 'repeat procedure in about 1 year',
  'repeat-procedure-3-years': 'repeat procedure in about 3 years',
  'repeat-procedure-5-years': 'repeat procedure in about 5 years',
  'repeat-procedure-10-years': 'repeat procedure in about 10 years',
};

const LANGUAGE: Record<Input['language'], string> = { en: 'English (en)', es: 'Spanish (es)' };

const READING_LEVEL: Record<Input['readingLevel'], string> = {
  basic: 'basic (about grade 5)',
  standard: 'standard (about grade 8)',
};

function anticoagulantPlan(plan: Input['anticoagulant']): string {
  switch (plan.plan) {
    case 'not-taking':
      return 'patient does not take a blood thinner';
    case 'resume-today':
      return 'resume the usual blood thinner today';
    case 'resume-after-days':
      return `resume the usual blood thinner in ${plan.days} day(s)`;
    case 'hold-until-contacted':
      return 'do NOT restart the blood thinner until the care team says to';
  }
}

const yesNo = (value: boolean): string => (value ? 'yes' : 'no');

/**
 * Renders each allowed field explicitly (never the raw object), so nothing
 * outside the input schema can reach the model.
 */
export function buildMessages(input: Input): ModelMessage[] {
  const { findings } = input;
  // Biopsies and removed polyps are both sent for lab testing — decided here, not by the model.
  const tissueSent = findings.biopsiesTaken || findings.polypsRemoved > 0;

  const facts = [
    `Procedures: ${input.procedures.map((p) => PROCEDURE[p]).join('; ')}`,
    `Sedation: ${SEDATION[input.sedation]}`,
    `Polyps removed: ${findings.polypsRemoved}`,
    `Biopsies taken: ${yesNo(findings.biopsiesTaken)}`,
    `Bleeding control (hemostasis) performed: ${yesNo(findings.hemostasisPerformed)}`,
    `Tissue sent for lab testing: ${yesNo(tissueSent)}`,
    `Blood-thinner plan: ${anticoagulantPlan(input.anticoagulant)}`,
    `Follow-up: ${FOLLOW_UP[input.followUp]}`,
    `Language: ${LANGUAGE[input.language]}`,
    `Reading level: ${READING_LEVEL[input.readingLevel]}`,
  ];

  return [
    {
      role: 'user',
      content: `Write discharge instructions from these procedure facts:\n${facts.map((f) => `- ${f}`).join('\n')}`,
    },
  ];
}

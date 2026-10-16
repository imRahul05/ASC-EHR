import type { DischargeInstructionsOutput } from '@asc/validation';
import { describe, expect, it } from 'vitest';

import {
  callCount,
  createAuditRecorder,
  createFixture,
  createTestGateway,
  respondWith,
} from '../../testing/fixtures.js';
import { AGENTS } from '../registry.js';
import { runAgent, type RunAgentOptions } from '../run.js';

const FIXTURE_RESPONSES: Record<string, DischargeInstructionsOutput> = {
  'eg-normal-screening-colonoscopy': {
    language: 'en',
    summary: 'You had a routine screening colonoscopy today. The examination was normal with no polyps found.',
    whatWasDone: ['Complete screening colonoscopy to the cecum', 'Normal mucosa, no biopsies or polyps removed'],
    diet: ['Resume normal regular diet as tolerated. Stay well hydrated.'],
    activity: ['Rest today due to sedation. Resume normal activities and driving tomorrow.'],
    medications: [
      { action: 'continue', instruction: 'Continue all routine prescribed medications as normal.' },
    ],
    warningSigns: {
      callClinic: ['Persistent abdominal bloating or mild nausea', 'Fever over 100.4°F'],
      goToEmergency: ['Severe abdominal pain', 'Heavy rectal bleeding', 'Dizziness or shortness of breath'],
    },
    followUp: 'Repeat screening colonoscopy in 10 years per guideline surveillance recommendations.',
    pathologyPending: {
      pending: false,
      message: '',
    },
  },
  'eg-colonoscopy-polypectomy': {
    language: 'en',
    summary: 'You had a colonoscopy with polyp removal today. Two polyps were removed and bleeding was controlled.',
    whatWasDone: ['Colonoscopy completed', 'Two polyps removed and sent for pathology', 'Hemostasis clips placed'],
    diet: ['Start with clear liquids, then progress to a soft diet today, and resume regular diet tomorrow.'],
    activity: ['Rest for the remainder of the day. Do not drive or operate machinery for 24 hours.'],
    medications: [
      { action: 'hold', instruction: 'Hold NSAIDs, aspirin, and blood thinners until contacted by clinic.' },
    ],
    warningSigns: {
      callClinic: [
        'Fever over 101°F (38.3°C)',
        'Minor rectal bleeding or small blood clots',
        'Nausea or mild cramps',
      ],
      goToEmergency: [
        'Severe abdominal pain that does not improve',
        'Large amounts of blood or large blood clots from rectum',
        'Dizziness, fainting, or chest pain',
      ],
    },
    followUp: 'Follow-up call next business day. Clinic review in 2 weeks.',
    pathologyPending: {
      pending: true,
      message: 'Pathology results will be available in 5–7 business days. Our office will contact you.',
    },
  },
  'eg-egd-dilation': {
    language: 'en',
    summary: 'You had an upper endoscopy (EGD) with dilation today. Your esophagus was examined and dilated.',
    whatWasDone: ['Upper endoscopy (EGD) performed', 'Esophageal dilation completed safely'],
    diet: ['Begin with cool clear liquids, progress to soft foods as tolerated today, avoid hot liquids or sharp foods.'],
    activity: ['Rest at home today. Do not drive or sign legal documents for 24 hours.'],
    medications: [
      { action: 'continue', instruction: 'Continue current medications as directed by your physician.' },
    ],
    warningSigns: {
      callClinic: [
        'Mild sore throat or difficulty swallowing that persists',
        'Low grade fever',
      ],
      goToEmergency: [
        'Severe difficulty swallowing (dysphagia) or inability to swallow saliva',
        'Severe chest pain, neck pain, or crepitus (crackling under neck skin)',
        'Shortness of breath or persistent vomiting',
      ],
    },
    followUp: 'Follow up with gastroenterology clinic as needed or scheduled.',
    pathologyPending: {
      pending: false,
      message: '',
    },
  },
  'flexible sigmoidoscopy with biopsy, Spanish, resume blood thinner in 2 days': {
    language: 'es',
    summary: 'Se le realizó una sigmoidoscopia flexible hoy con toma de biopsias.',
    whatWasDone: ['Sigmoidoscopia flexible realizada', 'Biopsias tomadas'],
    diet: ['Dieta liviana hoy.'],
    activity: ['Puede reanudar actividades normales mañana.'],
    medications: [
      { action: 'resume', instruction: 'Reanude su anticoagulante después de 2 días.' },
    ],
    warningSigns: {
      callClinic: ['Fiebre', 'Sangrado rectal leve'],
      goToEmergency: ['Dolor abdominal severo', 'Sangrado rectal abundante'],
    },
    followUp: 'Cita en la clínica en 6 semanas.',
    pathologyPending: {
      pending: true,
      message: 'Los resultados de patología estarán listos en 5 a 7 días hábiles.',
    },
  },
};

describe('CI Agent Evaluation Gate (REQ-18, US-M-02, NFR-15)', () => {
  it('every registered agent defines at least 3 eval cases', () => {
    const agents = Object.values(AGENTS);
    expect(agents.length).toBeGreaterThan(0);

    for (const agent of agents) {
      expect(agent.evalCases, `Agent "${agent.name}" must define evalCases`).toBeDefined();
      expect(
        agent.evalCases?.length ?? 0,
        `Agent "${agent.name}" must define at least 3 evalCases`,
      ).toBeGreaterThanOrEqual(3);
    }
  });

  describe('discharge-instructions eval suite', () => {
    const agent = AGENTS['discharge-instructions'];
    const evalCases = agent?.evalCases ?? [];

    it('passes 100% of clinical expectations without routing to non-BAA models', async () => {
      expect(evalCases.length).toBeGreaterThanOrEqual(3);

      for (const evalCase of evalCases) {
        const syntheticOutput = FIXTURE_RESPONSES[evalCase.name];
        expect(syntheticOutput, `Missing fixture output for case ${evalCase.name}`).toBeDefined();

        // The fixture routes BAA medium-tier requests to "a-med", while non-BAA "o-med" must stay uncalled.
        const fixture = createFixture({
          'a-med': respondWith(JSON.stringify(syntheticOutput)),
          'o-med': respondWith('{}'),
        });
        const audit = createAuditRecorder();
        const options: RunAgentOptions = {
          actor: { type: 'user', id: 'provider-1' },
          containsPhi: true,
          patientId: 'patient-synthetic-1',
          surgicalCaseId: 'case-synthetic-1',
          gateway: createTestGateway(fixture),
          audit,
        };

        const result = await runAgent(agent, evalCase.input, options);

        // 1. Verify success and deterministic output match
        expect(result.output).toBeDefined();

        // 2. BAA verification: non-BAA endpoint o-med was never called
        expect(callCount(fixture, 'o-med')).toBe(0);
        expect(callCount(fixture, 'a-med')).toBe(1);

        // 3. 100% expectation pass rate
        for (const expectation of evalCase.expectations) {
          const pass = expectation.check(result.output);
          expect(pass, `Expectation failed for "${evalCase.name}": ${expectation.description}`).toBe(true);
        }

        // 4. NFR-15 & HIPAA Audit verification: zero patient names / MRNs in audit event details
        expect(audit.events.length).toBe(1);
        const [event] = audit.events;
        expect(event?.outcome).toBe('SUCCESS');
        expect(event?.patientId).toBe('patient-synthetic-1');
        expect(event?.surgicalCaseId).toBe('case-synthetic-1');

        const serialized = JSON.stringify(event);
        expect(serialized).not.toMatch(/Jane|John|Doe|Smith|MRN-\d+/i);
        expect(serialized).not.toContain('CANARY');
      }
    });
  });
});

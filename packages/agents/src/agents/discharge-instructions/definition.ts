import { dischargeInstructionsOutputSchema } from '@repo/validation';

import { Task } from '../../config/index.js';
import { defineAgent } from '../define.js';
import { dischargeInstructionsInputSchema } from './input.js';
import { INSTRUCTIONS, PROMPT_VERSION, buildMessages } from './prompt.js';

/**
 * Patient-facing discharge instructions after colonoscopy / EGD / flexible
 * sigmoidoscopy. Output is a DRAFT for staff review before it reaches the patient.
 */
export const dischargeInstructionsAgent = defineAgent({
  name: 'discharge-instructions',
  description: 'Plain-language discharge instructions after a GI endoscopy (en / es).',
  task: Task.PatientInstructions,
  promptVersion: PROMPT_VERSION,
  input: dischargeInstructionsInputSchema,
  output: dischargeInstructionsOutputSchema,
  instructions: INSTRUCTIONS,
  buildMessages,
});

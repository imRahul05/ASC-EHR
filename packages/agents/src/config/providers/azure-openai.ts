import { createAzure } from '@ai-sdk/azure';

import type { Endpoint } from './define.js';

export interface AzureOpenAIEndpointSettings {
  /** Azure OpenAI resource name (`https://{resourceName}.openai.azure.com`). Either this or `baseURL`. */
  resourceName?: string;
  baseURL?: string;
  /** API key. Omit when using `tokenProvider` (Entra ID / managed identity — preferred). */
  apiKey?: string;
  /** Returns an Entra ID access token; invoked on every request. */
  tokenProvider?: () => Promise<string>;
}

/**
 * Azure OpenAI (`@ai-sdk/azure`). A factory, because resource and credentials
 * differ per environment. The model id passed to `createModel` is the
 * **deployment name** you created in the Azure resource.
 */
export function createAzureOpenAIEndpoint(settings: AzureOpenAIEndpointSettings): Endpoint {
  const azure = createAzure(settings);
  return {
    displayName: 'Azure OpenAI',
    // Covered by the Microsoft BAA (per spec: existing Azure BAA posture).
    // Confirm the resource's subscription/region is in scope before production PHI.
    baa: true,
    createModel: (deploymentName) => azure(deploymentName),
  };
}

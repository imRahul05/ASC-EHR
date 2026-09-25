/**
 * SDK endpoints — one file per Vercel AI SDK provider (@ai-sdk/*).
 * Each file owns the provider's BAA flag and how to create a model.
 * Adding one (e.g. `@ai-sdk/amazon-bedrock`) = one file here + export below.
 */
export * from './define.js';
export { anthropicEndpoint } from './anthropic.js';
export { createAzureOpenAIEndpoint, type AzureOpenAIEndpointSettings } from './azure-openai.js';
export { googleEndpoint } from './google.js';
export { openaiEndpoint } from './openai.js';

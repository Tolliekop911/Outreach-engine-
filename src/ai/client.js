// Anthropic client. Resolves credentials from the environment (ANTHROPIC_API_KEY
// or an `ant auth login` profile). Server-side only.
import Anthropic from '@anthropic-ai/sdk';
import config from '../config/index.js';

let client = null;

export function getAnthropic() {
  if (client) return client;
  // The SDK reads ANTHROPIC_API_KEY itself; pass it explicitly when configured
  // so our single config object stays the source of truth.
  client = config.ai.anthropicApiKey
    ? new Anthropic({ apiKey: config.ai.anthropicApiKey })
    : new Anthropic();
  return client;
}

export default getAnthropic;

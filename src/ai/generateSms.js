// AI generation of a short, personalized outreach SMS for one lead.
import config from '../config/index.js';
import { getAnthropic } from './client.js';
import { firstText, parseJsonObject } from './parse.js';

export function buildSmsSystemPrompt(outreach = config.outreach) {
  const o = outreach;
  return [
    'You write short sales text messages (SMS) to physical therapy professionals',
    'on behalf of:',
    `- Product: ${o.product || '(product not set)'}`,
    `- Value: ${o.valueProp || '(value prop not set)'}`,
    `- Ask: ${o.cta || '(cta not set)'}${o.ctaUrl ? ` (${o.ctaUrl})` : ''}`,
    '',
    'Rules:',
    '- Very short: 1-2 sentences, UNDER 300 characters total.',
    '- Casual, human, first-name basis. One clear ask.',
    '- No links unless the CTA url is given. Never invent facts.',
    '- Do NOT add "Reply STOP", a signature, or your name - the system appends',
    '  the opt-out line.',
    '',
    'Respond with ONLY JSON: {"text": "..."}',
  ].join('\n');
}

export function buildSmsUserPrompt(lead, stepPrompt) {
  const who = lead.first_name || 'there';
  const bits = [`Lead first name: ${who}`];
  if (lead.title) bits.push(`Title: ${lead.title}`);
  if (lead.organization) bits.push(`Clinic: ${lead.organization}`);
  if (lead.state) bits.push(`State: ${lead.state}`);
  return [
    'Write the SMS for this lead.',
    bits.join(' | '),
    stepPrompt ? `Guidance: ${stepPrompt}` : 'This is a first-touch text.',
  ].join('\n');
}

export async function generateSms(args) {
  const { lead, stepPrompt = '', client = getAnthropic() } = args;
  const response = await client.messages.create({
    model: config.ai.model,
    max_tokens: 400,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'low' },
    system: buildSmsSystemPrompt(),
    messages: [{ role: 'user', content: buildSmsUserPrompt(lead, stepPrompt) }],
  });
  if (response.stop_reason === 'refusal') throw new Error('AI refused to generate SMS');
  const obj = parseJsonObject(firstText(response));
  if (!obj || !obj.text) throw new Error('AI returned an unparseable SMS');
  return { text: String(obj.text).trim() };
}

export default generateSms;

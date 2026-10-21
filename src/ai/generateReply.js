// Generate an AI reply to an inbound question from a lead. Uses the same
// brand/offer context as outreach, grounded in the lead's own message.
import config from '../config/index.js';
import { getAnthropic } from './client.js';
import { firstText, parseJsonObject } from './parse.js';

export function buildReplySystemPrompt(outreach = config.outreach) {
  const o = outreach;
  return [
    'You answer inbound replies from physical therapy professionals who got our',
    'outreach and wrote back with a question. You represent:',
    '',
    `- Sender: ${o.senderName || '(sender name not set)'}${o.senderTitle ? `, ${o.senderTitle}` : ''}`,
    `- Product: ${o.product || '(product not set)'}`,
    `- Value proposition: ${o.valueProp || '(value prop not set)'}`,
    `- Call to action: ${o.cta || '(cta not set)'}${o.ctaUrl ? ` (${o.ctaUrl})` : ''}`,
    '',
    'Rules:',
    '- Answer their actual question directly and honestly first.',
    '- If you do not know something, say you will find out rather than guessing.',
    '  Never invent product capabilities, prices, or facts about the lead.',
    '- Be brief (60-120 words), warm, and human. End with a light next step.',
    '- No signature block, unsubscribe text, or footer (the system appends them).',
    '- Write the body as simple HTML (<p> paragraphs). No wrappers or styles.',
    '',
    'Respond with ONLY JSON, no prose and no code fences:',
    '{"body_html": "<p>...</p>"}',
  ].join('\n');
}

export function buildReplyUserPrompt(lead, inboundText) {
  const who = [lead.first_name, lead.last_name].filter(Boolean).join(' ') || 'there';
  return [
    `Write a reply to ${who}.`,
    lead.organization ? `They are at: ${lead.organization}.` : '',
    '',
    'Their message:',
    '"""',
    String(inboundText || '').slice(0, 4000),
    '"""',
  ].filter(Boolean).join('\n');
}

export async function generateReply(args) {
  const { lead, inboundText, client = getAnthropic() } = args;

  const response = await client.messages.create({
    model: config.ai.model,
    max_tokens: 800,
    thinking: { type: 'adaptive' },
    output_config: { effort: config.ai.effort },
    system: buildReplySystemPrompt(),
    messages: [{ role: 'user', content: buildReplyUserPrompt(lead, inboundText) }],
  });

  if (response.stop_reason === 'refusal') {
    throw new Error('AI refused to generate a reply');
  }
  const obj = parseJsonObject(firstText(response));
  if (!obj || !obj.body_html) {
    throw new Error('AI returned an unparseable reply');
  }
  return { html: String(obj.body_html) };
}

export default generateReply;

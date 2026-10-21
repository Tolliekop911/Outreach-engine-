// AI generation of a personalized outreach email for one lead. Builds the
// prompt from the brand/offer context and the lead's fields, asks Claude for a
// subject and an HTML body as JSON, and returns { subject, html }.
//
// The client is injectable so this is unit-testable without a network call.
import config from '../config/index.js';
import { getAnthropic } from './client.js';
import { firstText, parseJsonObject } from './parse.js';

// Describe who is writing and what they are offering. Pure, no I/O.
export function buildSystemPrompt(outreach = config.outreach) {
  const o = outreach;
  return [
    'You write short, genuine B2B outreach emails to physical therapy',
    'professionals and clinic owners. You are writing on behalf of:',
    '',
    `- Sender: ${o.senderName || '(sender name not set)'}${o.senderTitle ? `, ${o.senderTitle}` : ''}`,
    `- Product: ${o.product || '(product not set)'}`,
    `- Value proposition: ${o.valueProp || '(value prop not set)'}`,
    `- Call to action: ${o.cta || '(cta not set)'}${o.ctaUrl ? ` (${o.ctaUrl})` : ''}`,
    '',
    'Rules:',
    '- Be concise: 90-150 words, 2-3 short paragraphs.',
    '- Personalize naturally from the lead details; never invent facts about',
    '  the lead or the product, and never fabricate mutual connections.',
    '- Warm and direct, not salesy or hyperbolic. No fake urgency.',
    '- One clear call to action. Do not add a signature block, unsubscribe',
    '  text, or a tracking footer; those are appended by the system.',
    '- Write the body as simple HTML (<p> paragraphs, an optional <a> for the',
    '  CTA link). No <html>/<head>/<body> wrappers, no inline styles.',
    '',
    'Respond with ONLY a JSON object, no prose and no code fences:',
    '{"subject": "...", "body_html": "<p>...</p>"}',
  ].join('\n');
}

// Describe the specific lead and any per-step guidance. Pure, no I/O.
export function buildUserPrompt(lead, stepPrompt) {
  const facts = [];
  const add = (label, v) => { if (v) facts.push(`- ${label}: ${v}`); };
  add('First name', lead.first_name);
  add('Last name', lead.last_name);
  add('Title/credential', lead.title);
  add('Organization/clinic', lead.organization);
  add('Specialty', lead.specialty);
  add('City', lead.city);
  add('State', lead.state);
  for (const [k, v] of Object.entries(lead.custom || {})) add(k, v);

  return [
    'Write the email for this lead.',
    '',
    'Lead details:',
    facts.length ? facts.join('\n') : '- (no details beyond contact address)',
    '',
    stepPrompt ? `Guidance for this message: ${stepPrompt}` : 'This is a first-touch introduction.',
  ].join('\n');
}

/**
 * @param {object} args
 * @param {object} args.lead        Row from outreach.leads.
 * @param {string} [args.stepPrompt] Per-step guidance (from campaign_steps.prompt).
 * @param {object} [args.client]    Injected Anthropic client (for tests).
 * @returns {Promise<{subject: string, html: string}>}
 */
export async function generateEmail(args) {
  const { lead, stepPrompt = '', client = getAnthropic() } = args;

  const response = await client.messages.create({
    model: config.ai.model,
    max_tokens: 1200,
    thinking: { type: 'adaptive' },
    output_config: { effort: config.ai.effort },
    system: buildSystemPrompt(),
    messages: [{ role: 'user', content: buildUserPrompt(lead, stepPrompt) }],
  });

  if (response.stop_reason === 'refusal') {
    const cat = response.stop_details?.category || 'unspecified';
    throw new Error(`AI refused to generate (category: ${cat})`);
  }

  const text = firstText(response);
  const obj = parseJsonObject(text);
  if (!obj || !obj.subject || !obj.body_html) {
    throw new Error(`AI returned unparseable email: ${text.slice(0, 200)}`);
  }
  return { subject: String(obj.subject), html: String(obj.body_html) };
}

export default generateEmail;

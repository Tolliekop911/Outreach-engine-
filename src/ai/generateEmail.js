// AI generation of a personalized outreach email for one lead. Builds the
// prompt from the brand/offer context and the lead's fields, asks Claude for a
// subject and an HTML body as JSON, and returns { subject, html }.
//
// The client is injectable so this is unit-testable without a network call.
import config from '../config/index.js';
import { getAnthropic } from './client.js';
import { firstText, parseJsonObject } from './parse.js';
// (ANGLES/pickAngle defined below)

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
    'Write like a real person firing off a quick, genuine note - not a',
    'marketing template. Every email should feel freshly written.',
    '',
    'Rules:',
    '- Concise: 70-130 words.',
    '- VARY it every time: different opening line, structure, rhythm, and word',
    '  choice. Never start with a formulaic intro like "I wanted to briefly',
    '  introduce" or "I hope this email finds you." Open like a human would.',
    '- Sound natural and a little informal - contractions, short sentences,',
    '  the odd fragment. Confident, not stiff or salesy. No hype, no fake urgency.',
    '- Personalize from the lead details; never invent facts about the lead or',
    '  the product, and never fabricate a mutual connection or prior contact.',
    '- One clear, low-pressure call to action.',
    '- Do NOT write a sign-off, signature, name, unsubscribe, or footer - the',
    '  system appends all of that. End on your last real sentence.',
    '- Body as simple HTML (<p> paragraphs, optional <a> for the CTA link).',
    '  No <html>/<head>/<body> wrappers, no inline styles.',
    '',
    'Respond with ONLY a JSON object, no prose and no code fences:',
    '{"subject": "...", "body_html": "<p>...</p>"}',
  ].join('\n');
}

// Different hooks so 15k emails don't converge on one template. One is picked
// at random per email to push variety in the opening and framing.
export const ANGLES = [
  'open with a specific pain point of their discipline or setting',
  'lead with a short, concrete result other clinics saw',
  'open with a genuine question about how they handle documentation or billing today',
  'reference their specialty or state naturally in the first line',
  'start casual and direct, like a quick heads-up between colleagues',
  'open with a single surprising stat or observation about PT admin time',
  'lead with curiosity - something you noticed about clinics like theirs',
];

export function pickAngle() {
  return ANGLES[Math.floor(Math.random() * ANGLES.length)];
}

// Describe the specific lead and any per-step guidance. Pure, no I/O.
export function buildUserPrompt(lead, stepPrompt, angle) {
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
    angle ? `For variety, this time ${angle}. Make the opening feel unique.` : '',
  ].filter(Boolean).join('\n');
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
  const angle = args.angle || pickAngle();

  const response = await client.messages.create({
    model: config.ai.model,
    max_tokens: 1200,
    thinking: { type: 'adaptive' },
    output_config: { effort: config.ai.effort },
    system: buildSystemPrompt(),
    messages: [{ role: 'user', content: buildUserPrompt(lead, stepPrompt, angle) }],
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

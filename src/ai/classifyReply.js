// Classify an inbound reply so the engine can act on it. A deterministic
// opt-out catch runs first (never trust the model alone to honor unsubscribes);
// otherwise Claude sorts the reply into a small set of categories.
import config from '../config/index.js';
import { getAnthropic } from './client.js';
import { firstText, parseJsonObject } from './parse.js';

export const REPLY_CATEGORIES = [
  'interested',      // wants to talk / learn more -> hand off to a human
  'question',        // has a specific question -> auto-answer
  'not_interested',  // polite no -> stop the sequence
  'opt_out',         // unsubscribe / stop / remove me -> suppress
  'auto_reply',      // out-of-office / bounce autoresponder -> ignore, keep sequence
  'wrong_person',    // not the right contact -> stop
  'other',
];

// Deterministic opt-out detection. Catches the common phrasings regardless of
// what the model thinks, so legal opt-outs are always honored.
const OPT_OUT_PATTERNS = [
  /\bunsubscribe\b/i,
  /\bopt[\s-]?out\b/i,
  /\bremove me\b/i,
  /\btake me off\b/i,
  /\bstop (emailing|contacting|messaging)\b/i,
  /^\s*stop\s*$/i,
  /\bdo not (contact|email|message)\b/i,
  /\bno longer (wish|want) to\b/i,
];

export function detectOptOut(text) {
  if (!text) return false;
  return OPT_OUT_PATTERNS.some((re) => re.test(text));
}

function buildClassifyPrompt(inboundText, lead) {
  const who = [lead.first_name, lead.last_name].filter(Boolean).join(' ') || lead.email || 'the lead';
  return [
    `Classify this inbound email reply from ${who} to our outreach.`,
    '',
    'Reply text:',
    '"""',
    String(inboundText || '').slice(0, 4000),
    '"""',
    '',
    `Choose exactly one category from: ${REPLY_CATEGORIES.join(', ')}.`,
    '- interested: wants a demo/call or to learn more',
    '- question: asks something specific we should answer',
    '- not_interested: a no, not now, or already have a solution',
    '- opt_out: asks to stop/unsubscribe/be removed',
    '- auto_reply: out-of-office or automated bounce',
    '- wrong_person: says they are not the right contact',
    '- other: none of the above',
    '',
    'Respond with ONLY JSON, no prose:',
    '{"category": "...", "confidence": 0.0, "reason": "short"}',
  ].join('\n');
}

export async function classifyReply(args) {
  const { inboundText, lead, client = getAnthropic() } = args;

  // Opt-out short-circuit: no model call needed, and it can never be missed.
  if (detectOptOut(inboundText)) {
    return { category: 'opt_out', confidence: 1, reason: 'matched opt-out phrase' };
  }

  const response = await client.messages.create({
    model: config.ai.model,
    max_tokens: 400,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'low' }, // classification is cheap work
    messages: [{ role: 'user', content: buildClassifyPrompt(inboundText, lead) }],
  });

  if (response.stop_reason === 'refusal') {
    return { category: 'other', confidence: 0, reason: 'model refused to classify' };
  }

  const obj = parseJsonObject(firstText(response)) || {};
  const category = REPLY_CATEGORIES.includes(obj.category) ? obj.category : 'other';
  const confidence = typeof obj.confidence === 'number' ? obj.confidence : 0;
  return { category, confidence, reason: String(obj.reason || '') };
}

export default classifyReply;

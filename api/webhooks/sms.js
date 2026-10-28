// Inbound SMS webhook (Twilio). Twilio posts application/x-www-form-urlencoded
// with From and Body. Point your Twilio number's Messaging webhook here.
import { handleInboundSms } from '../../src/channels/sms/inbound.js';
import { jsonBody } from '../_lib.js';

function formOrJson(req) {
  if (req.body && typeof req.body === 'object') return req.body; // Vercel parses both
  const raw = typeof req.body === 'string' ? req.body : '';
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { /* try urlencoded */ }
  const out = {};
  for (const [k, v] of new URLSearchParams(raw)) out[k] = v;
  return out;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).send('method not allowed'); return; }
  const b = formOrJson(req) || jsonBody(req) || {};
  try {
    await handleInboundSms({ from: b.From || b.from, body: b.Body || b.body });
  } catch (e) {
    console.error('inbound sms failed:', e.message);
  }
  // Always 200 with empty TwiML so Twilio doesn't retry/alert.
  res.status(200).setHeader('Content-Type', 'text/xml');
  res.send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
}

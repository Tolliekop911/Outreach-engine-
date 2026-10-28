// Bland AI call-outcome webhook. Point your Bland calls' webhook here (the call
// channel sets it automatically to /webhooks/voice).
import { handleCallOutcome } from '../../src/channels/voice/inbound.js';
import { jsonBody } from '../_lib.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).send('method not allowed'); return; }
  const payload = jsonBody(req) || {};
  try {
    await handleCallOutcome(payload);
  } catch (e) {
    console.error('voice webhook failed:', e.message);
  }
  res.status(200).json({ ok: true });
}

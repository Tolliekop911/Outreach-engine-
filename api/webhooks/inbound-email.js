// Inbound reply webhook. Expects JSON { from, subject, text, providerId }.
// Point your provider's inbound-parse (or an IMAP bridge) at this route.
import { handleInboundEmail } from '../../src/channels/email/inbound.js';
import { jsonBody } from '../_lib.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).send('method not allowed'); return; }
  const payload = jsonBody(req);
  if (payload === null) { res.status(400).send('bad json'); return; }
  try {
    const out = await handleInboundEmail(payload);
    res.status(200).json(out);
  } catch (e) {
    console.error('inbound webhook failed:', e.message);
    res.status(500).send('error');
  }
}

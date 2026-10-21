// Provider event webhook (e.g. SendGrid events): bounces/complaints -> suppression.
import { handleSendgridEvents } from '../../src/channels/email/webhooks.js';
import { jsonBody } from '../_lib.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).send('method not allowed'); return; }
  const events = jsonBody(req);
  if (events === null) { res.status(400).send('bad json'); return; }
  try {
    const out = await handleSendgridEvents(events);
    res.status(200).json(out);
  } catch (e) {
    console.error('event webhook failed:', e.message);
    res.status(500).send('error');
  }
}

// One-click unsubscribe: suppresses the address and shows a confirmation page.
import { verifyToken } from '../../src/channels/email/tracking.js';
import { recordUnsubscribe } from '../../src/channels/email/webhooks.js';

export default async function handler(req, res) {
  const p = verifyToken(String(req.query.token || ''));
  if (p?.k === 'u' && p.e) {
    try {
      await recordUnsubscribe({ messageId: p.m, leadId: p.l, email: p.e });
    } catch (e) {
      console.error('unsubscribe failed:', e.message);
      res.status(500).setHeader('Content-Type', 'text/plain');
      res.send('Could not process unsubscribe. Please try again later.');
      return;
    }
    res.status(200).setHeader('Content-Type', 'text/html');
    res.send(
      '<html><body style="font-family:sans-serif;max-width:480px;margin:60px auto">' +
      '<h2>You are unsubscribed</h2>' +
      '<p>You will not receive further emails from us. Sorry to see you go.</p>' +
      '</body></html>');
    return;
  }
  res.status(400).setHeader('Content-Type', 'text/plain');
  res.send('Invalid unsubscribe link');
}

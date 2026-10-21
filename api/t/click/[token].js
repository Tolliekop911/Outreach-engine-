// Click tracking: records the click, then 302s to the signed target URL.
import { verifyToken } from '../../../src/channels/email/tracking.js';
import { recordClick } from '../../../src/channels/email/webhooks.js';

export default async function handler(req, res) {
  const p = verifyToken(String(req.query.token || ''));
  if (p?.k === 'c' && p.m && /^https?:\/\//i.test(p.u || '')) {
    try { await recordClick(p.m, p.u); } catch (e) { console.error('click record failed:', e.message); }
    res.status(302).setHeader('Location', p.u);
    res.end();
    return;
  }
  res.status(400).setHeader('Content-Type', 'text/plain');
  res.send('Invalid link');
}

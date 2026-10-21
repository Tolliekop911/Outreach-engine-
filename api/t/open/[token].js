// Open-tracking pixel. Always returns a 1x1 GIF, even on a bad token.
import { verifyToken } from '../../../src/channels/email/tracking.js';
import { recordOpen } from '../../../src/channels/email/webhooks.js';
import { PIXEL } from '../../_lib.js';

export default async function handler(req, res) {
  const token = String(req.query.token || '').replace(/\.gif$/, '');
  const p = verifyToken(token);
  if (p?.k === 'o' && p.m) {
    try { await recordOpen(p.m); } catch (e) { console.error('open record failed:', e.message); }
  }
  res.status(200);
  res.setHeader('Content-Type', 'image/gif');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.send(PIXEL);
}

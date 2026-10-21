// Minimal dependency-free HTTP server exposing the email tracking and webhook
// endpoints. Run with: node src/server.js
//
//   GET  /health                 liveness check
//   GET  /t/open/:token.gif      open pixel  -> records open, returns 1x1 gif
//   GET  /t/click/:token         click       -> records click, 302 to target
//   GET  /u/:token               unsubscribe -> suppresses, shows confirmation
//   POST /webhooks/email         provider events (e.g. SendGrid) -> suppression
import http from 'node:http';
import 'dotenv/config';
import config from './config/index.js';
import { verifyToken } from './channels/email/tracking.js';
import {
  recordOpen, recordClick, recordUnsubscribe, handleSendgridEvents,
} from './channels/email/webhooks.js';
import { handleInboundEmail } from './channels/email/inbound.js';

// 1x1 transparent GIF.
const PIXEL = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
);

function send(res, status, headers, body) {
  res.writeHead(status, headers);
  res.end(body);
}

function sendPixel(res) {
  send(res, 200, {
    'Content-Type': 'image/gif',
    'Content-Length': PIXEL.length,
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  }, PIXEL);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > 2 * 1024 * 1024) { reject(new Error('body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const parts = url.pathname.split('/').filter(Boolean);

    if (req.method === 'GET' && url.pathname === '/health') {
      return send(res, 200, { 'Content-Type': 'text/plain' }, 'ok');
    }

    // Open pixel: /t/open/<token>.gif
    if (req.method === 'GET' && parts[0] === 't' && parts[1] === 'open') {
      const token = (parts[2] || '').replace(/\.gif$/, '');
      const p = verifyToken(token);
      if (p?.k === 'o' && p.m) {
        recordOpen(p.m).catch((e) => console.error('open record failed:', e.message));
      }
      return sendPixel(res); // always return a pixel, even on a bad token
    }

    // Click: /t/click/<token>  (target URL is inside the signed token)
    if (req.method === 'GET' && parts[0] === 't' && parts[1] === 'click') {
      const p = verifyToken(parts[2]);
      if (p?.k === 'c' && p.m && /^https?:\/\//i.test(p.u || '')) {
        recordClick(p.m, p.u).catch((e) => console.error('click record failed:', e.message));
        return send(res, 302, { Location: p.u }, '');
      }
      return send(res, 400, { 'Content-Type': 'text/plain' }, 'Invalid link');
    }

    // Unsubscribe: /u/<token>
    if (req.method === 'GET' && parts[0] === 'u') {
      const p = verifyToken(parts[1]);
      if (p?.k === 'u' && p.e) {
        await recordUnsubscribe({ messageId: p.m, leadId: p.l, email: p.e });
        return send(res, 200, { 'Content-Type': 'text/html' },
          '<html><body style="font-family:sans-serif;max-width:480px;margin:60px auto">' +
          '<h2>You are unsubscribed</h2>' +
          '<p>You will not receive further emails from us. Sorry to see you go.</p>' +
          '</body></html>');
      }
      return send(res, 400, { 'Content-Type': 'text/plain' }, 'Invalid unsubscribe link');
    }

    // Provider event webhook: POST /webhooks/email
    if (req.method === 'POST' && url.pathname === '/webhooks/email') {
      const raw = await readBody(req);
      let events;
      try { events = JSON.parse(raw); } catch { return send(res, 400, {}, 'bad json'); }
      const out = await handleSendgridEvents(events);
      return send(res, 200, { 'Content-Type': 'application/json' }, JSON.stringify(out));
    }

    // Inbound reply webhook: POST /webhooks/inbound-email
    // Expects JSON { from, subject, text, providerId }. Point your provider's
    // inbound-parse (or an IMAP bridge) at this route.
    if (req.method === 'POST' && url.pathname === '/webhooks/inbound-email') {
      const raw = await readBody(req);
      let payload;
      try { payload = JSON.parse(raw); } catch { return send(res, 400, {}, 'bad json'); }
      const out = await handleInboundEmail(payload);
      return send(res, 200, { 'Content-Type': 'application/json' }, JSON.stringify(out));
    }

    return send(res, 404, { 'Content-Type': 'text/plain' }, 'Not found');
  } catch (err) {
    console.error('server error:', err.message);
    return send(res, 500, { 'Content-Type': 'text/plain' }, 'Server error');
  }
});

server.listen(config.tracking.port, () => {
  console.log(`Outreach webhook server listening on :${config.tracking.port}`);
});

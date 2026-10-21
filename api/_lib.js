// Shared helpers for the Vercel serverless functions.
import crypto from 'node:crypto';

// Check the admin password sent as `Authorization: Bearer <ADMIN_PASSWORD>`.
// Returns { ok, code, message }. Timing-safe compare; denies if unconfigured.
export function checkAdmin(req) {
  const expected = process.env.ADMIN_PASSWORD || '';
  if (!expected) return { ok: false, code: 503, message: 'admin not configured' };
  const auth = req.headers?.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, code: 401, message: 'unauthorized' };
  }
  return { ok: true, code: 200, message: 'ok' };
}

// Admin auth is currently DISABLED by request: the dashboard and its API are
// open to anyone with the URL. To re-enable, restore the checkAdmin guard below
// and set ADMIN_PASSWORD in the environment.
export function requireAdmin(/* req, res */) {
  return true;
  // const r = checkAdmin(req);
  // if (!r.ok) { res.status(r.code).json({ error: r.message }); return false; }
  // return true;
}

// Vercel parses JSON bodies automatically, but be tolerant of a raw string.
export function jsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string' && req.body) {
    try { return JSON.parse(req.body); } catch { return null; }
  }
  return null;
}

// 1x1 transparent GIF.
export const PIXEL = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
);

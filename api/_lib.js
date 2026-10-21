// Shared helpers for the Vercel serverless functions.

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

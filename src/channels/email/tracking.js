// Email tracking: signed opaque tokens for open/click/unsubscribe, plus the
// HTML rewriting that injects the tracking pixel, wraps links through a click
// redirect, and appends the CAN-SPAM footer with an unsubscribe link.
import crypto from 'node:crypto';
import config from '../../config/index.js';

// --- Signed tokens ----------------------------------------------------------
// A token carries a small JSON payload plus an HMAC so the server can trust it
// without a database lookup and nobody can forge an unsubscribe for someone.

function b64url(buf) {
  return Buffer.from(buf).toString('base64url');
}

export function signToken(payload) {
  if (!config.tracking.secret) {
    throw new Error('TRACKING_SECRET is not set; cannot sign tracking tokens.');
  }
  const body = b64url(JSON.stringify(payload));
  const sig = crypto
    .createHmac('sha256', config.tracking.secret)
    .update(body)
    .digest('base64url');
  return `${body}.${sig}`;
}

// Returns the payload if the token is valid and untampered, else null.
export function verifyToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const expected = crypto
    .createHmac('sha256', config.tracking.secret)
    .update(body)
    .digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

// --- URL builders -----------------------------------------------------------

function base() {
  if (!config.tracking.baseUrl) {
    throw new Error('TRACKING_BASE_URL is not set; cannot build tracking links.');
  }
  return config.tracking.baseUrl;
}

export function openPixelUrl(messageId) {
  const t = signToken({ k: 'o', m: messageId });
  return `${base()}/t/open/${t}`;
}

export function clickUrl(messageId, targetUrl) {
  // The target is signed into the token so the redirect cannot be tampered with
  // (no open-redirect via an unsigned query param).
  const t = signToken({ k: 'c', m: messageId, u: targetUrl });
  return `${base()}/t/click/${t}`;
}

export function unsubscribeUrl(messageId, leadId, email) {
  const t = signToken({ k: 'u', m: messageId, l: leadId, e: email });
  return `${base()}/u/${t}`;
}

// --- HTML composition -------------------------------------------------------

// Wrap every http(s) href in the body through the click redirect.
export function rewriteLinks(html, messageId) {
  return html.replace(
    /(<a\b[^>]*\bhref=")(https?:\/\/[^"]+)(")/gi,
    (_m, pre, url, post) => `${pre}${clickUrl(messageId, url)}${post}`
  );
}

function pixelTag(messageId) {
  const url = openPixelUrl(messageId);
  return `<img src="${url}" width="1" height="1" alt="" style="display:none" />`;
}

function footer(messageId, leadId, email) {
  const unsub = unsubscribeUrl(messageId, leadId, email);
  const addr = config.email.postalAddress || '[postal address not configured]';
  return (
    `<div style="margin-top:24px;font-size:12px;color:#888">` +
    `<div>${escapeHtml(addr)}</div>` +
    `<div><a href="${unsub}">Unsubscribe</a></div>` +
    `</div>`
  );
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Produce the final send-ready HTML: links wrapped, footer + unsubscribe added,
// open pixel appended last.
export function renderTrackedHtml({ html, messageId, leadId, email }) {
  const wrapped = rewriteLinks(html, messageId);
  return `${wrapped}\n${footer(messageId, leadId, email)}\n${pixelTag(messageId)}`;
}

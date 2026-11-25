// Pure-ish handlers for inbound email tracking and provider events. Each writes
// to the database and is framework-agnostic so it can run under the bundled
// HTTP server, a Vercel function, or anything else.
import { getDb } from '../../db/client.js';
import { addSuppression } from '../suppression.js';

async function recordEvent(type, { messageId = null, leadId = null, detail = {} }) {
  const db = getDb();
  const { error } = await db.from('message_events').insert({
    message_id: messageId,
    lead_id: leadId,
    event_type: type,
    detail,
  });
  if (error) throw new Error(`Failed to record ${type} event: ${error.message}`);
}

// Security scanners (Microsoft Safe Links, Mimecast, Proofpoint, Barracuda,
// Google image proxy, etc.) auto-open and pre-click every email on arrival,
// inflating opens/clicks. Filter those so the funnel reflects real humans.
const BOT_UA = /bot|crawl|spider|preview|scan|proofpoint|mimecast|barracuda|microsoft|outlook|office365|googleimageproxy|google-read-aloud|symantec|forcepoint|fireeye|sophos|trend ?micro|cisco|ironport|slackbot|facebookexternalhit|curl|wget|python-requests|go-http|headless|phantom/i;

async function isBotHit(db, messageId, userAgent) {
  if (userAgent && BOT_UA.test(userAgent)) return true;
  if (!messageId) return false;
  try {
    const { data } = await db.from('messages').select('sent_at').eq('id', messageId).single();
    if (data?.sent_at) {
      const age = Date.now() - new Date(data.sent_at).getTime();
      // A hit within 15s of sending is almost always an automated scanner.
      if (age >= 0 && age < 15000) return true;
    }
  } catch { /* ignore */ }
  return false;
}

export async function recordOpen(messageId, userAgent) {
  const db = getDb();
  const bot = await isBotHit(db, messageId, userAgent);
  await recordEvent(bot ? 'open_bot' : 'open', { messageId, detail: { ua: userAgent || null } });
}

export async function recordClick(messageId, url, userAgent) {
  const db = getDb();
  const bot = await isBotHit(db, messageId, userAgent);
  await recordEvent(bot ? 'click_bot' : 'click', { messageId, detail: { url, ua: userAgent || null } });
}

// Honor an unsubscribe: suppress the email and mark the lead.
export async function recordUnsubscribe({ messageId, leadId, email }) {
  await addSuppression({ email, scope: 'email', reason: 'opt_out', note: 'email unsubscribe link' });
  const db = getDb();
  if (leadId) {
    await db.from('leads').update({ status: 'suppressed' }).eq('id', leadId);
  }
  await recordEvent('unsubscribe', { messageId, leadId, detail: { email } });
}

// Map a SendGrid event webhook payload (array of events) into message events and
// suppressions. Bounces, dropped, and spam reports suppress the address.
const SUPPRESS_EVENTS = new Set(['bounce', 'dropped', 'spamreport', 'blocked']);

export async function handleSendgridEvents(events) {
  if (!Array.isArray(events)) return { processed: 0 };
  let processed = 0;
  for (const ev of events) {
    const email = (ev.email || '').toLowerCase();
    const type = ev.event;
    if (!type) continue;
    await recordEvent(`provider_${type}`, { detail: { email, reason: ev.reason } });
    if (SUPPRESS_EVENTS.has(type) && email) {
      const reason = type === 'spamreport' ? 'complaint' : 'bounce';
      await addSuppression({ email, scope: 'all', reason, note: `sendgrid:${type}` });
    }
    processed++;
  }
  return { processed };
}

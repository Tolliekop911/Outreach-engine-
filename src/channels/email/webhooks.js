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

export async function recordOpen(messageId) {
  await recordEvent('open', { messageId });
}

export async function recordClick(messageId, url) {
  await recordEvent('click', { messageId, detail: { url } });
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

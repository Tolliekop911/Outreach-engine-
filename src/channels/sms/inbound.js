// Handle an inbound SMS (Twilio). Honors STOP/opt-out deterministically, logs
// the message, and stops any active sequence for that lead.
import { getDb } from '../../db/client.js';
import { addSuppression } from '../suppression.js';
import { detectOptOut } from '../../ai/classifyReply.js';

// Carrier-standard opt-out keywords, plus our general opt-out detector.
const STOP_WORDS = /^\s*(stop|stopall|unsubscribe|cancel|end|quit)\s*$/i;

export async function handleInboundSms({ from, body }) {
  const phone = String(from || '').trim();
  const text = String(body || '');
  if (!phone) return { matched: false, reason: 'no_sender' };
  const db = getDb();

  const { data: leads } = await db.from('leads').select('*').eq('phone', phone).limit(1);
  const lead = leads?.[0];

  const optedOut = STOP_WORDS.test(text) || detectOptOut(text);

  // Record inbound if we can tie it to a lead (messages.lead_id is required).
  if (lead) {
    const { data: msg } = await db.from('messages').insert({
      lead_id: lead.id, channel: 'sms', direction: 'inbound', status: 'received',
      from_address: phone, body: text,
    }).select('id').single();
    await db.from('message_events').insert({
      message_id: msg?.id || null, lead_id: lead.id,
      event_type: optedOut ? 'sms_opt_out' : 'sms_reply', detail: { text },
    });
  }

  if (optedOut) {
    await addSuppression({ phone, scope: 'all', reason: 'opt_out', note: 'SMS STOP' });
    if (lead) {
      await db.from('leads').update({ status: 'suppressed' }).eq('id', lead.id);
      await db.from('campaign_enrollments').update({ status: 'suppressed' })
        .eq('lead_id', lead.id).eq('status', 'active');
    }
    return { matched: !!lead, optedOut: true };
  }
  return { matched: !!lead, optedOut: false };
}

export default handleInboundSms;

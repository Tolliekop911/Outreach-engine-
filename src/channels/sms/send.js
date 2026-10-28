// Send one SMS to one lead via Twilio. Enforces, in order: a phone number, the
// global suppression list, the daily SMS cap, and DRY_RUN. Appends the opt-out
// line (required for compliant texting) and records the message.
import config from '../../config/index.js';
import { getDb } from '../../db/client.js';
import { isSuppressed } from '../suppression.js';

const OPT_OUT = 'Reply STOP to opt out.';

async function countSentToday(db) {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const { count, error } = await db
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('channel', 'sms').eq('direction', 'outbound')
    .gte('sent_at', start.toISOString());
  if (error) throw new Error(`Failed to count today's SMS: ${error.message}`);
  return count || 0;
}

async function twilioSend({ from, to, body }) {
  const { twilioAccountSid: sid, twilioAuthToken: token } = config.phone;
  if (!sid || !token) throw new Error('TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN not set.');
  if (!from) throw new Error('No OUTREACH_PHONE_NUMBERS configured to send from.');
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ From: from, To: to, Body: body }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Twilio send failed (${res.status}): ${detail.slice(0, 300)}`);
  }
  const data = await res.json();
  return data.sid || null;
}

export async function sendSmsToLead(args, opts = {}) {
  const { lead, text, campaignId = null, stepId = null } = args;
  const dryRun = opts.dryRun ?? config.limits.dryRun;
  const db = getDb();

  if (!lead?.phone) return { sent: false, skipped: true, reason: 'no_phone' };
  if (await isSuppressed({ phone: lead.phone, channel: 'sms' })) {
    return { sent: false, skipped: true, reason: 'suppressed' };
  }
  const sentToday = await countSentToday(db);
  if (sentToday >= config.limits.maxSmsPerDay) {
    return { sent: false, skipped: true, reason: 'daily_cap_reached', sentToday };
  }

  const from = config.phone.numbers[0];
  const body = `${text}\n\n${OPT_OUT}`;

  const { data: msg, error: insErr } = await db.from('messages').insert({
    lead_id: lead.id, campaign_id: campaignId, step_id: stepId,
    channel: 'sms', direction: 'outbound', status: 'queued',
    from_address: from, to_address: lead.phone, body,
  }).select('id').single();
  if (insErr) throw new Error(`Failed to create SMS message: ${insErr.message}`);

  if (dryRun) {
    await db.from('messages').update({ error: 'dry_run (not sent)' }).eq('id', msg.id);
    return { sent: false, dryRun: true, messageId: msg.id, preview: { to: lead.phone, body } };
  }

  try {
    const providerId = await twilioSend({ from, to: lead.phone, body });
    await db.from('messages').update({
      status: 'sent', provider_id: providerId, sent_at: new Date().toISOString(),
    }).eq('id', msg.id);
    return { sent: true, messageId: msg.id, providerId };
  } catch (err) {
    await db.from('messages').update({ status: 'failed', error: err.message }).eq('id', msg.id);
    return { sent: false, failed: true, messageId: msg.id, reason: err.message };
  }
}

export default sendSmsToLead;

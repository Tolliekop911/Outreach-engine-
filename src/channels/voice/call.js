// Place one AI voice call to one lead via Bland AI. Enforces: a phone number,
// the global suppression list, the daily call cap, and DRY_RUN. Records the call
// as a message; the outcome arrives later on the /webhooks/voice callback.
import config from '../../config/index.js';
import { getDb } from '../../db/client.js';
import { isSuppressed } from '../suppression.js';
import { buildCallTask } from '../../ai/callTask.js';

async function countCallsToday(db) {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const { count, error } = await db
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('channel', 'voice').eq('direction', 'outbound')
    .gte('sent_at', start.toISOString());
  if (error) throw new Error(`Failed to count today's calls: ${error.message}`);
  return count || 0;
}

async function blandCall({ phone, task, webhook, metadata }) {
  const key = config.voice.blandApiKey;
  if (!key) throw new Error('BLAND_API_KEY not set.');
  const body = {
    phone_number: phone,
    task,
    voice: config.voice.voice || undefined,
    from: config.voice.fromNumber || undefined,
    webhook: webhook || undefined,
    metadata,
    record: true,
    wait_for_greeting: true,
  };
  const res = await fetch('https://api.bland.ai/v1/calls', {
    method: 'POST',
    headers: { authorization: key, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.status === 'error') {
    throw new Error(`Bland call failed (${res.status}): ${data.message || JSON.stringify(data).slice(0, 200)}`);
  }
  return data.call_id || null;
}

export async function callLead(args, opts = {}) {
  const { lead, stepPrompt = '', campaignId = null, stepId = null } = args;
  const dryRun = opts.dryRun ?? config.limits.dryRun;
  const db = getDb();

  if (!lead?.phone) return { sent: false, skipped: true, reason: 'no_phone' };
  if (await isSuppressed({ phone: lead.phone, channel: 'voice' })) {
    return { sent: false, skipped: true, reason: 'suppressed' };
  }
  const today = await countCallsToday(db);
  if (today >= config.limits.maxCallsPerDay) {
    return { sent: false, skipped: true, reason: 'daily_cap_reached', today };
  }

  const task = buildCallTask(lead, stepPrompt);
  const { data: msg, error: insErr } = await db.from('messages').insert({
    lead_id: lead.id, campaign_id: campaignId, step_id: stepId,
    channel: 'voice', direction: 'outbound', status: 'queued',
    from_address: config.voice.fromNumber || null, to_address: lead.phone,
    body: task,
  }).select('id').single();
  if (insErr) throw new Error(`Failed to create call record: ${insErr.message}`);

  if (dryRun) {
    await db.from('messages').update({ error: 'dry_run (not called)' }).eq('id', msg.id);
    return { sent: false, dryRun: true, messageId: msg.id, preview: { to: lead.phone } };
  }

  try {
    const base = config.tracking.baseUrl;
    const callId = await blandCall({
      phone: lead.phone, task,
      webhook: base ? `${base}/webhooks/voice` : undefined,
      metadata: { lead_id: lead.id, message_id: msg.id },
    });
    await db.from('messages').update({
      status: 'sent', provider_id: callId, sent_at: new Date().toISOString(),
    }).eq('id', msg.id);
    return { sent: true, messageId: msg.id, callId };
  } catch (err) {
    await db.from('messages').update({ status: 'failed', error: err.message }).eq('id', msg.id);
    return { sent: false, failed: true, messageId: msg.id, reason: err.message };
  }
}

export default callLead;

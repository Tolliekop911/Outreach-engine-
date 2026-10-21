// Send one email to one lead. Enforces, in order: a deliverable address, the
// global suppression list, the daily send cap, and the DRY_RUN safety switch.
// On a real send it records the message and returns the row id.
import config from '../../config/index.js';
import { getDb } from '../../db/client.js';
import { isSuppressed } from '../suppression.js';
import { getEmailProvider } from './providers/index.js';
import { renderTrackedHtml } from './tracking.js';

async function countSentToday(db) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const { count, error } = await db
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('channel', 'email')
    .eq('direction', 'outbound')
    .gte('sent_at', start.toISOString());
  if (error) throw new Error(`Failed to count today's sends: ${error.message}`);
  return count || 0;
}

/**
 * @param {object} args
 * @param {object} args.lead     Row from outreach.leads (needs id + email).
 * @param {string} args.subject
 * @param {string} args.html     Message body HTML (tracking is added here).
 * @param {string} [args.campaignId]
 * @param {string} [args.stepId]
 * @param {object} [opts]
 * @param {boolean} [opts.dryRun]  Defaults to config.limits.dryRun.
 */
export async function sendEmailToLead(args, opts = {}) {
  const { lead, subject, html, campaignId = null, stepId = null } = args;
  const dryRun = opts.dryRun ?? config.limits.dryRun;
  const db = getDb();

  if (!lead?.email) {
    return { sent: false, skipped: true, reason: 'no_email' };
  }
  if (await isSuppressed({ email: lead.email, channel: 'email' })) {
    return { sent: false, skipped: true, reason: 'suppressed' };
  }
  const sentToday = await countSentToday(db);
  if (sentToday >= config.limits.maxEmailsPerDay) {
    return { sent: false, skipped: true, reason: 'daily_cap_reached', sentToday };
  }

  // Create the message first so its id can seed the tracking links.
  const { data: msg, error: insErr } = await db
    .from('messages')
    .insert({
      lead_id: lead.id,
      campaign_id: campaignId,
      step_id: stepId,
      channel: 'email',
      direction: 'outbound',
      status: 'queued',
      from_address: config.email.fromAddress,
      to_address: lead.email,
      subject,
    })
    .select('id')
    .single();
  if (insErr) throw new Error(`Failed to create message: ${insErr.message}`);

  const trackedHtml = renderTrackedHtml({
    html, messageId: msg.id, leadId: lead.id, email: lead.email,
  });

  if (dryRun) {
    await db.from('messages').update({ body: trackedHtml, error: 'dry_run (not sent)' })
      .eq('id', msg.id);
    return { sent: false, dryRun: true, messageId: msg.id, preview: { to: lead.email, subject } };
  }

  try {
    const provider = getEmailProvider();
    const { providerId } = await provider.send({
      from: config.email.fromAddress,
      fromName: config.email.fromName,
      to: lead.email,
      subject,
      html: trackedHtml,
    });
    await db.from('messages').update({
      status: 'sent',
      body: trackedHtml,
      provider_id: providerId,
      sent_at: new Date().toISOString(),
    }).eq('id', msg.id);
    return { sent: true, messageId: msg.id, providerId };
  } catch (err) {
    await db.from('messages').update({ status: 'failed', error: err.message })
      .eq('id', msg.id);
    return { sent: false, failed: true, messageId: msg.id, reason: err.message };
  }
}

export default sendEmailToLead;

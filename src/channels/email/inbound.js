// Handle an inbound email reply: record it, classify it, and take the right
// action per category - suppress opt-outs, stop the sequence on a human reply,
// auto-answer questions, and flag interested leads for a human.
import config from '../../config/index.js';
import { getDb } from '../../db/client.js';
import { addSuppression } from '../suppression.js';
import { sendEmailToLead } from './send.js';
import { getEmailProvider } from './providers/index.js';
import { classifyReply } from '../../ai/classifyReply.js';
import { generateReply } from '../../ai/generateReply.js';

async function recordEvent(db, type, { messageId, leadId, detail }) {
  await db.from('message_events').insert({
    message_id: messageId || null,
    lead_id: leadId || null,
    event_type: type,
    detail: detail || {},
  });
}

async function stopEnrollments(db, leadId, status) {
  await db.from('campaign_enrollments')
    .update({ status })
    .eq('lead_id', leadId)
    .eq('status', 'active');
}

async function notifyHandoff(lead, inboundText) {
  if (!config.outreach.handoffEmail) return false;
  const provider = getEmailProvider();
  const who = [lead.first_name, lead.last_name].filter(Boolean).join(' ') || lead.email;
  await provider.send({
    from: config.email.fromAddress,
    fromName: config.email.fromName,
    to: config.outreach.handoffEmail,
    subject: `Hot lead replied: ${who}`,
    html: `<p>${who} (${lead.email || 'no email'}${lead.organization ? `, ${lead.organization}` : ''}) `
      + `looks interested.</p><p>Their message:</p><blockquote>${String(inboundText || '').slice(0, 1000)}</blockquote>`,
  });
  return true;
}

/**
 * @param {object} inbound
 * @param {string} inbound.from     Sender email.
 * @param {string} [inbound.subject]
 * @param {string} inbound.text     Reply body (plain text).
 * @param {string} [inbound.providerId]
 * @param {object} [opts] { dryRun }
 */
export async function handleInboundEmail(inbound, opts = {}) {
  const { from, subject = '', text = '', providerId = null } = inbound;
  const dryRun = opts.dryRun ?? config.limits.dryRun;
  const db = getDb();

  const email = String(from || '').trim().toLowerCase();
  if (!email) return { matched: false, reason: 'no_sender' };

  const { data: leads } = await db.from('leads').select('*').eq('email', email).limit(1);
  const lead = leads?.[0];
  if (!lead) return { matched: false, reason: 'no_matching_lead', email };

  // Record the inbound message.
  const { data: msg } = await db.from('messages').insert({
    lead_id: lead.id,
    channel: 'email',
    direction: 'inbound',
    status: 'received',
    from_address: email,
    to_address: config.email.fromAddress,
    subject,
    body: text,
    provider_id: providerId,
  }).select('id').single();
  const messageId = msg?.id || null;
  await recordEvent(db, 'reply', { messageId, leadId: lead.id, detail: { subject } });

  // Classify.
  const { category, confidence, reason } = await classifyReply({ inboundText: text, lead });
  await recordEvent(db, 'classified', { messageId, leadId: lead.id, detail: { category, confidence, reason } });

  let action = 'none';
  let responded = false;

  switch (category) {
    case 'opt_out':
      await addSuppression({ email, scope: 'all', reason: 'opt_out', note: 'reply opt-out' });
      await db.from('leads').update({ status: 'suppressed' }).eq('id', lead.id);
      await stopEnrollments(db, lead.id, 'suppressed');
      action = 'suppressed';
      break;

    case 'interested':
      await db.from('leads').update({ status: 'engaged' }).eq('id', lead.id);
      await stopEnrollments(db, lead.id, 'stopped');
      responded = await notifyHandoff(lead, text); // human handoff, not auto-close
      await recordEvent(db, 'hot_lead', { leadId: lead.id, detail: { handoff_notified: responded } });
      action = 'flagged_for_human';
      break;

    case 'question': {
      await db.from('leads').update({ status: 'engaged' }).eq('id', lead.id);
      await stopEnrollments(db, lead.id, 'stopped'); // move to a real conversation
      const { html } = await generateReply({ lead, inboundText: text });
      const res = await sendEmailToLead(
        { lead, subject: subject?.startsWith('Re:') ? subject : `Re: ${subject || 'your note'}`, html },
        { dryRun },
      );
      responded = Boolean(res.sent || res.dryRun);
      action = 'auto_replied';
      break;
    }

    case 'not_interested':
      await db.from('leads').update({ status: 'unqualified' }).eq('id', lead.id);
      await stopEnrollments(db, lead.id, 'stopped');
      action = 'stopped';
      break;

    case 'wrong_person':
    case 'other':
      await stopEnrollments(db, lead.id, 'stopped'); // a human replied; pause automation
      action = 'stopped_for_review';
      break;

    case 'auto_reply':
    default:
      action = 'ignored'; // leave the sequence running
      break;
  }

  return { matched: true, leadId: lead.id, category, confidence, action, responded, dryRun };
}

export default handleInboundEmail;

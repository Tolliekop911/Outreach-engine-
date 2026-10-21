// Generate a personalized email with the AI and send it through the email
// channel (which applies suppression, caps, tracking, and DRY_RUN). This is the
// piece the campaign pipeline will call per lead per step.
import { generateEmail } from '../../ai/generateEmail.js';
import { sendEmailToLead } from './send.js';

export async function generateAndSendEmail(args, opts = {}) {
  const { lead, stepPrompt = '', campaignId = null, stepId = null } = args;
  const { subject, html } = await generateEmail({ lead, stepPrompt });
  return sendEmailToLead({ lead, subject, html, campaignId, stepId }, opts);
}

export default generateAndSendEmail;

// Generate a personalized SMS with the AI and send it via Twilio (suppression,
// cap, DRY_RUN all enforced in sendSmsToLead).
import { generateSms } from '../../ai/generateSms.js';
import { sendSmsToLead } from './send.js';

export async function generateAndSendSms(args, opts = {}) {
  const { lead, stepPrompt = '', campaignId = null, stepId = null } = args;
  const { text } = await generateSms({ lead, stepPrompt });
  return sendSmsToLead({ lead, text, campaignId, stepId }, opts);
}

export default generateAndSendSms;

// Execute a single campaign step for one lead by dispatching on the step's
// channel. Email generates with the AI and sends through the tracked, capped,
// suppression-checked, DRY_RUN-safe path. SMS and voice are not built yet.
import { generateAndSendEmail } from '../channels/email/aiSend.js';
import { generateAndSendSms } from '../channels/sms/aiSend.js';

export async function runStep({ lead, step, campaignId }, opts = {}) {
  const { dryRun = false } = opts;

  // Pipeline-level dry run: simulate without calling the AI or any provider,
  // so sequencing can be exercised with no credentials and no spend.
  if (dryRun) {
    return { ok: true, simulated: true, channel: step.channel };
  }

  switch (step.channel) {
    case 'email':
      return generateAndSendEmail({
        lead, stepPrompt: step.prompt, campaignId, stepId: step.id,
      });
    case 'sms':
      return generateAndSendSms({
        lead, stepPrompt: step.prompt, campaignId, stepId: step.id,
      });
    case 'voice':
      return { ok: true, skipped: true, reason: 'channel_not_implemented:voice' };
    default:
      return { ok: false, skipped: true, reason: `unknown_channel:${step.channel}` };
  }
}

export default runStep;

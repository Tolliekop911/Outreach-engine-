// Handle the Bland AI call-outcome webhook: record the transcript/summary as a
// message event, tie it to the lead via the metadata we sent on the call.
import { getDb } from '../../db/client.js';

export async function handleCallOutcome(payload) {
  const db = getDb();
  const meta = payload.metadata || {};
  const leadId = meta.lead_id || null;
  const messageId = meta.message_id || null;

  // Mark the originating call message as completed with the call status.
  if (messageId) {
    await db.from('messages')
      .update({ status: payload.status === 'completed' ? 'delivered' : 'sent' })
      .eq('id', messageId);
  }
  await db.from('message_events').insert({
    message_id: messageId,
    lead_id: leadId,
    event_type: 'call_completed',
    detail: {
      status: payload.status || null,
      call_length: payload.call_length ?? null,
      answered: payload.answered_by ?? null,
      summary: payload.summary || null,
      transcript: payload.concatenated_transcript || null,
    },
  });
  return { recorded: true, leadId };
}

export default handleCallOutcome;

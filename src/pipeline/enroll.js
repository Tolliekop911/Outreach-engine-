// Enroll leads into a campaign. Creates one campaign_enrollments row per lead
// (idempotent via the unique (campaign_id, lead_id) constraint) with the first
// step's fire time.
import { getDb } from '../db/client.js';
import { firstActionAt } from './sequence.js';

async function loadSteps(db, campaignId) {
  const { data, error } = await db
    .from('campaign_steps')
    .select('*')
    .eq('campaign_id', campaignId);
  if (error) throw new Error(`Failed to load steps: ${error.message}`);
  return data;
}

// Enroll every member of the campaign's audience.
export async function enrollCampaignAudience(campaignId) {
  const db = getDb();

  const { data: campaign, error: cErr } = await db
    .from('campaigns').select('id, audience_id').eq('id', campaignId).single();
  if (cErr) throw new Error(`Campaign not found: ${cErr.message}`);
  if (!campaign.audience_id) throw new Error('Campaign has no audience assigned.');

  const steps = await loadSteps(db, campaignId);
  if (steps.length === 0) throw new Error('Campaign has no steps.');
  const next = firstActionAt(steps).toISOString();

  // Pull audience members (paginated) and enroll them.
  let from = 0;
  const pageSize = 1000;
  let enrolled = 0;
  for (;;) {
    const { data: members, error: mErr } = await db
      .from('audience_members')
      .select('lead_id')
      .eq('audience_id', campaign.audience_id)
      .range(from, from + pageSize - 1);
    if (mErr) throw new Error(`Failed to load audience: ${mErr.message}`);
    if (members.length === 0) break;

    const rows = members.map((m) => ({
      campaign_id: campaignId,
      lead_id: m.lead_id,
      status: 'active',
      current_step: 0,
      next_action_at: next,
    }));
    // Ignore leads already enrolled.
    const { error: insErr, count } = await db
      .from('campaign_enrollments')
      .upsert(rows, { onConflict: 'campaign_id,lead_id', ignoreDuplicates: true, count: 'exact' });
    if (insErr) throw new Error(`Enrollment insert failed: ${insErr.message}`);
    enrolled += count ?? rows.length;

    if (members.length < pageSize) break;
    from += pageSize;
  }
  return { enrolled };
}

export default enrollCampaignAudience;

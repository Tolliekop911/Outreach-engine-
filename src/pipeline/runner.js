// Scheduler tick: find enrollments whose next action is due, run the current
// step for each, and advance the enrollment. Safe to call repeatedly (cron or
// a loop). Stops early if a channel reports its daily cap is reached.
import { getDb } from '../db/client.js';
import { stepToRun, planAdvance } from './sequence.js';
import { runStep } from './runStep.js';

// Load and cache the ordered steps per campaign within a tick.
async function stepLoader(db) {
  const cache = new Map();
  return async (campaignId) => {
    if (cache.has(campaignId)) return cache.get(campaignId);
    const { data, error } = await db
      .from('campaign_steps').select('*').eq('campaign_id', campaignId);
    if (error) throw new Error(`Failed to load steps: ${error.message}`);
    cache.set(campaignId, data);
    return data;
  };
}

/**
 * Process due enrollments.
 * @param {object} [opts]
 * @param {number} [opts.limit]  Max enrollments to process this tick (default 200).
 * @param {boolean} [opts.dryRun] Simulate steps (no AI, no send). Default config DRY_RUN.
 */
export async function runDueEnrollments(opts = {}) {
  const { limit = 200, dryRun } = opts;
  const db = getDb();
  const now = new Date();

  const { data: due, error } = await db
    .from('campaign_enrollments')
    .select('*')
    .eq('status', 'active')
    .lte('next_action_at', now.toISOString())
    .order('next_action_at', { ascending: true })
    .limit(limit);
  if (error) throw new Error(`Failed to load due enrollments: ${error.message}`);

  const stats = { due: due.length, ran: 0, sent: 0, skipped: 0, completed: 0, capped: false };
  if (due.length === 0) return stats;

  const loadSteps = await stepLoader(db);

  // Batch-fetch the leads and campaign statuses we need.
  const leadIds = [...new Set(due.map((e) => e.lead_id))];
  const campaignIds = [...new Set(due.map((e) => e.campaign_id))];
  const { data: leads } = await db.from('leads').select('*').in('id', leadIds);
  const { data: campaigns } = await db.from('campaigns').select('id, status').in('id', campaignIds);
  const leadById = new Map((leads || []).map((l) => [l.id, l]));
  const campaignById = new Map((campaigns || []).map((c) => [c.id, c]));

  for (const enr of due) {
    const campaign = campaignById.get(enr.campaign_id);
    if (!campaign || campaign.status !== 'active') continue; // paused/archived: leave it

    const lead = leadById.get(enr.lead_id);
    if (!lead) continue;
    if (lead.status === 'suppressed') {
      await db.from('campaign_enrollments')
        .update({ status: 'suppressed' }).eq('id', enr.id);
      stats.skipped++;
      continue;
    }

    const steps = await loadSteps(enr.campaign_id);
    const step = stepToRun(enr.current_step, steps);
    if (!step) {
      await db.from('campaign_enrollments')
        .update({ status: 'completed', completed_at: now.toISOString() }).eq('id', enr.id);
      stats.completed++;
      continue;
    }

    const result = await runStep({ lead, step, campaignId: enr.campaign_id }, { dryRun });

    // Respect a channel's daily cap: stop the tick, do not advance this one.
    if (result?.reason === 'daily_cap_reached') {
      stats.capped = true;
      break;
    }

    stats.ran++;
    if (result?.sent || result?.simulated) stats.sent++;

    // Advance regardless of a soft skip (e.g. unimplemented channel) so the
    // sequence keeps moving; a hard cap is the only thing that holds position.
    const plan = planAdvance(enr.current_step, steps, now.getTime());
    await db.from('campaign_enrollments').update({
      current_step: plan.current_step,
      status: plan.status,
      next_action_at: plan.next_action_at ? plan.next_action_at.toISOString() : null,
      completed_at: plan.status === 'completed' ? now.toISOString() : null,
    }).eq('id', enr.id);
    if (plan.status === 'completed') stats.completed++;
  }

  return stats;
}

export default runDueEnrollments;

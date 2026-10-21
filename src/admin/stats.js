// Data layer for the admin dashboard. Reads the outreach schema and shapes it
// for the UI. Kept out of the API functions so it is reusable and testable.
import { getDb } from '../db/client.js';

export const CAMPAIGN_STATUSES = ['draft', 'active', 'paused', 'completed', 'archived'];

export function validateCampaignStatus(status) {
  return CAMPAIGN_STATUSES.includes(status);
}

async function count(db, table, build = (q) => q) {
  const { count: n, error } = await build(
    db.from(table).select('*', { count: 'exact', head: true })
  );
  if (error) throw new Error(`count(${table}) failed: ${error.message}`);
  return n || 0;
}

// Headline numbers for the overview.
export async function getSummary() {
  const db = getDb();
  const [
    leadsTotal, leadsEngaged, leadsSuppressed, leadsConverted,
    campaignsTotal, campaignsActive,
    enrollmentsActive,
    emailsSent, opens, clicks, replies, suppression,
  ] = await Promise.all([
    count(db, 'leads'),
    count(db, 'leads', (q) => q.eq('status', 'engaged')),
    count(db, 'leads', (q) => q.eq('status', 'suppressed')),
    count(db, 'leads', (q) => q.eq('status', 'converted')),
    count(db, 'campaigns'),
    count(db, 'campaigns', (q) => q.eq('status', 'active')),
    count(db, 'campaign_enrollments', (q) => q.eq('status', 'active')),
    count(db, 'messages', (q) => q.eq('channel', 'email').eq('direction', 'outbound').eq('status', 'sent')),
    count(db, 'message_events', (q) => q.eq('event_type', 'open')),
    count(db, 'message_events', (q) => q.eq('event_type', 'click')),
    count(db, 'message_events', (q) => q.eq('event_type', 'reply')),
    count(db, 'suppression'),
  ]);
  return {
    leads: { total: leadsTotal, engaged: leadsEngaged, suppressed: leadsSuppressed, converted: leadsConverted },
    campaigns: { total: campaignsTotal, active: campaignsActive },
    enrollments: { active: enrollmentsActive },
    email: { sent: emailsSent, opens, clicks, replies },
    suppressed: suppression,
  };
}

// Paginated, filterable lead list.
export async function listLeads({ limit = 50, offset = 0, status = '', q = '' } = {}) {
  const db = getDb();
  let query = db.from('leads')
    .select('id, email, first_name, last_name, title, organization, state, status, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (status) query = query.eq('status', status);
  if (q) query = query.or(`email.ilike.%${q}%,last_name.ilike.%${q}%,organization.ilike.%${q}%`);
  const { data, count: total, error } = await query;
  if (error) throw new Error(`listLeads failed: ${error.message}`);
  return { rows: data, total: total || 0, limit, offset };
}

// Campaigns with step and enrollment counts.
export async function listCampaigns() {
  const db = getDb();
  const { data: campaigns, error } = await db
    .from('campaigns').select('id, name, status, created_at').order('created_at', { ascending: false });
  if (error) throw new Error(`listCampaigns failed: ${error.message}`);

  const out = [];
  for (const c of campaigns) {
    const [steps, enrolled, active, completed] = await Promise.all([
      count(db, 'campaign_steps', (q) => q.eq('campaign_id', c.id)),
      count(db, 'campaign_enrollments', (q) => q.eq('campaign_id', c.id)),
      count(db, 'campaign_enrollments', (q) => q.eq('campaign_id', c.id).eq('status', 'active')),
      count(db, 'campaign_enrollments', (q) => q.eq('campaign_id', c.id).eq('status', 'completed')),
    ]);
    out.push({ ...c, steps, enrolled, active, completed });
  }
  return out;
}

// Interested / engaged leads for human follow-up.
export async function listHotLeads({ limit = 50 } = {}) {
  const db = getDb();
  const { data, error } = await db.from('leads')
    .select('id, email, first_name, last_name, title, organization, state, updated_at')
    .eq('status', 'engaged')
    .order('updated_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`listHotLeads failed: ${error.message}`);
  return data;
}

export async function setCampaignStatus(id, status) {
  if (!validateCampaignStatus(status)) throw new Error(`invalid status: ${status}`);
  const db = getDb();
  const { data, error } = await db.from('campaigns')
    .update({ status }).eq('id', id).select('id, status').single();
  if (error) throw new Error(`setCampaignStatus failed: ${error.message}`);
  return data;
}

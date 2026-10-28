// Single admin API function dispatching on the :action segment. Consolidated
// into one serverless function to stay under the Vercel Hobby 12-function limit.
// URLs are unchanged: /api/admin/summary, /leads, /campaigns, /hot-leads,
// /activity, /diag, /campaign-status.
import { requireAdmin, jsonBody } from '../_lib.js';
import config from '../../src/config/index.js';
import { getDb } from '../../src/db/client.js';
import {
  getSummary, listLeads, listCampaigns, listHotLeads, listActivity,
  setCampaignStatus, validateCampaignStatus,
} from '../../src/admin/stats.js';

function keyRole(k) {
  if (!k) return 'MISSING';
  if (k.startsWith('sb_publishable')) return 'publishable (WRONG - that is the public key)';
  if (k.startsWith('sb_secret')) return 'secret (ok)';
  const parts = k.split('.');
  if (parts.length === 3) {
    try { return JSON.parse(Buffer.from(parts[1], 'base64url').toString()).role || 'jwt(no role)'; }
    catch { return 'jwt(undecodable)'; }
  }
  return 'unknown-format';
}

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  const action = req.query.action;
  try {
    switch (action) {
      case 'summary':
        return res.status(200).json(await getSummary());
      case 'campaigns':
        return res.status(200).json({ rows: await listCampaigns() });
      case 'hot-leads':
        return res.status(200).json({ rows: await listHotLeads({}) });
      case 'activity':
        return res.status(200).json(await listActivity({ limit: 80 }));
      case 'leads': {
        const { limit, offset, status, q } = req.query || {};
        return res.status(200).json(await listLeads({
          limit: Math.min(parseInt(limit, 10) || 50, 200),
          offset: parseInt(offset, 10) || 0,
          status: status || '', q: q || '',
        }));
      }
      case 'diag': {
        const out = {
          hasUrl: !!config.db.url,
          urlRef: (config.db.url || '').replace(/^https?:\/\//, '').split('.')[0],
          schema: config.db.schema,
          serviceKeyRole: keyRole(config.db.serviceRoleKey),
          hasAnthropicKey: !!config.ai.anthropicApiKey,
          emailProvider: config.email.provider,
          dryRun: config.limits.dryRun,
        };
        try {
          const { count, error } = await getDb().from('leads').select('*', { count: 'exact', head: true });
          out.leadCount = error ? ('ERROR: ' + error.message) : count;
        } catch (e) { out.leadCount = 'ERROR: ' + e.message; }
        return res.status(200).json(out);
      }
      case 'campaign-status': {
        if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
        const b = jsonBody(req) || {};
        if (!b.id || !validateCampaignStatus(b.status)) {
          return res.status(400).json({ error: 'need { id, status } with a valid status' });
        }
        return res.status(200).json(await setCampaignStatus(b.id, b.status));
      }
      default:
        return res.status(404).json({ error: 'unknown admin action' });
    }
  } catch (e) {
    console.error(`admin ${action} failed:`, e.message);
    res.status(500).json({ error: e.message });
  }
}

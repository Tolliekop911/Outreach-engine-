import { requireAdmin, jsonBody } from '../_lib.js';
import { setCampaignStatus, validateCampaignStatus } from '../../src/admin/stats.js';

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  if (req.method !== 'POST') { res.status(405).json({ error: 'method not allowed' }); return; }
  const body = jsonBody(req) || {};
  const { id, status } = body;
  if (!id || !validateCampaignStatus(status)) {
    res.status(400).json({ error: 'need { id, status } with a valid status' });
    return;
  }
  try {
    res.status(200).json(await setCampaignStatus(id, status));
  } catch (e) {
    console.error('campaign-status failed:', e.message);
    res.status(500).json({ error: e.message });
  }
}

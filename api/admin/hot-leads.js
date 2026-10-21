import { requireAdmin } from '../_lib.js';
import { listHotLeads } from '../../src/admin/stats.js';

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  try {
    res.status(200).json({ rows: await listHotLeads({}) });
  } catch (e) {
    console.error('hot-leads failed:', e.message);
    res.status(500).json({ error: e.message });
  }
}

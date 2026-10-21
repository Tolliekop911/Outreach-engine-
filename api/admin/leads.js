import { requireAdmin } from '../_lib.js';
import { listLeads } from '../../src/admin/stats.js';

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  try {
    const { limit, offset, status, q } = req.query || {};
    const out = await listLeads({
      limit: Math.min(parseInt(limit, 10) || 50, 200),
      offset: parseInt(offset, 10) || 0,
      status: status || '',
      q: q || '',
    });
    res.status(200).json(out);
  } catch (e) {
    console.error('leads failed:', e.message);
    res.status(500).json({ error: e.message });
  }
}

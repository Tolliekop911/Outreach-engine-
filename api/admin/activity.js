import { requireAdmin } from '../_lib.js';
import { listActivity } from '../../src/admin/stats.js';

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  try {
    res.status(200).json(await listActivity({ limit: 80 }));
  } catch (e) {
    console.error('activity failed:', e.message);
    res.status(500).json({ error: e.message });
  }
}

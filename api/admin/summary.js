import { requireAdmin } from '../_lib.js';
import { getSummary } from '../../src/admin/stats.js';

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  try {
    res.status(200).json(await getSummary());
  } catch (e) {
    console.error('summary failed:', e.message);
    res.status(500).json({ error: e.message });
  }
}

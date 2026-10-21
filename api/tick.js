// Scheduler tick, driven by Vercel Cron. Secured with CRON_SECRET: Vercel Cron
// sends `Authorization: Bearer $CRON_SECRET` automatically when that env var is
// set, so random callers can't trigger sends.
import { runDueEnrollments } from '../src/pipeline/runner.js';

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.authorization || '';
    if (auth !== `Bearer ${secret}`) { res.status(401).send('unauthorized'); return; }
  }
  try {
    // Keep each serverless tick small so it fits the function time limit; the
    // cron fires again shortly. Daily caps still govern total volume.
    const stats = await runDueEnrollments({ limit: 25 });
    res.status(200).json(stats);
  } catch (e) {
    console.error('tick failed:', e.message);
    res.status(500).json({ error: e.message });
  }
}

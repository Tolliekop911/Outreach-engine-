#!/usr/bin/env node
// Run the campaign scheduler.
//
//   node scripts/run-campaigns.js                 one tick, then exit
//   node scripts/run-campaigns.js --loop 60       tick every 60 seconds
//   node scripts/run-campaigns.js --dry-run       simulate steps (no AI/send)
//   node scripts/run-campaigns.js --enroll <id>   enroll a campaign's audience
//
// DRY_RUN in .env also forces simulation. Run one tick from cron for production.
import 'dotenv/config';
import config from '../src/config/index.js';
import { runDueEnrollments } from '../src/pipeline/runner.js';
import { enrollCampaignAudience } from '../src/pipeline/enroll.js';

function parseArgs(argv) {
  const args = { loop: null, dryRun: false, enroll: null, limit: 200 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') args.dryRun = true;
    else if (a === '--loop') args.loop = parseInt(argv[++i], 10) || 60;
    else if (a === '--enroll') args.enroll = argv[++i];
    else if (a === '--limit') args.limit = parseInt(argv[++i], 10) || 200;
  }
  return args;
}

async function tick(dryRun, limit) {
  const stats = await runDueEnrollments({ dryRun, limit });
  const stamp = new Date().toISOString();
  console.log(`[${stamp}] due=${stats.due} ran=${stats.ran} sent=${stats.sent} ` +
    `completed=${stats.completed} skipped=${stats.skipped}${stats.capped ? ' (daily cap reached)' : ''}`);
  return stats;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dryRun = args.dryRun || config.limits.dryRun;
  if (dryRun) console.log('DRY RUN: steps are simulated (no AI, no send).');

  if (args.enroll) {
    const { enrolled } = await enrollCampaignAudience(args.enroll);
    console.log(`Enrolled ${enrolled} lead(s) into campaign ${args.enroll}.`);
    return;
  }

  if (args.loop) {
    console.log(`Looping every ${args.loop}s. Ctrl+C to stop.`);
    for (;;) {
      await tick(dryRun, args.limit);
      await new Promise((r) => setTimeout(r, args.loop * 1000));
    }
  } else {
    await tick(dryRun, args.limit);
  }
}

main().catch((err) => { console.error('Scheduler failed:', err.message); process.exit(1); });

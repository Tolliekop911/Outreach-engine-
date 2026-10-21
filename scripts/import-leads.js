#!/usr/bin/env node
// CLI: import a purchased lead list into the outreach database.
//
// Usage:
//   node scripts/import-leads.js <file> [--source "APTA CSM 2027"] [--dry-run]
//
// --dry-run parses, cleans, and reports counts without writing anything or
// needing database credentials. Always dry-run a new list first.
import 'dotenv/config';
import path from 'node:path';
import fs from 'node:fs';
import { importLeads } from '../src/leads/import.js';

function parseArgs(argv) {
  const args = { file: null, source: null, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') args.dryRun = true;
    else if (a === '--source') args.source = argv[++i];
    else if (!args.file) args.file = a;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.file) {
    console.error('Usage: node scripts/import-leads.js <file> [--source "Name"] [--dry-run]');
    process.exit(1);
  }
  const filePath = path.resolve(args.file);
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  const result = await importLeads(filePath, {
    sourceName: args.source || path.basename(filePath),
    dryRun: args.dryRun,
  });

  const { stats, mapping, unmapped } = result;
  console.log(`\nFile: ${filePath}`);
  console.log(`Mode: ${result.dryRun ? 'DRY RUN (nothing written)' : 'LIVE'}`);
  console.log(`Source: ${result.sourceName}`);
  console.log('\nColumn mapping:');
  for (const [src, field] of Object.entries(mapping)) {
    console.log(`  "${src}" -> ${field}`);
  }
  if (unmapped.length) console.log(`  (kept in custom: ${unmapped.join(', ')})`);

  console.log('\nResults:');
  console.log(`  rows in file:        ${stats.total}`);
  console.log(`  no email or phone:   ${stats.unreachable}`);
  console.log(`  duplicate in file:   ${stats.dupInFile}`);
  if (!result.dryRun) console.log(`  already in database: ${stats.dupInDb}`);
  console.log(`  ${result.dryRun ? 'would insert' : 'inserted'}:        ${result.dryRun ? stats.toInsert : stats.inserted}`);

  if (result.dryRun && result.sample?.length) {
    console.log('\nSample of cleaned leads:');
    console.log(JSON.stringify(result.sample, null, 2));
  }
}

main().catch((err) => {
  console.error('\nImport failed:', err.message);
  process.exit(1);
});

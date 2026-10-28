// Core lead import: read a CSV/XLSX file, clean and normalize rows, dedupe
// (within the file and against what is already in the database), and store.
// Pure of any CLI concerns so it can be called from a script or a server route.
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'csv-parse/sync';
import * as XLSX from 'xlsx';
import { getDb } from '../db/client.js';
import {
  buildHeaderMapping, normalizeRow, isReachable, dedupeKey,
} from './normalize.js';

const INSERT_BATCH = 500;

// --- File reading -----------------------------------------------------------

// Read a file into an array of row objects keyed by header, plus the header list.
export function readRows(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.csv' || ext === '.tsv') {
    const text = fs.readFileSync(filePath, 'utf8');
    const records = parse(text, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      bom: true,
      delimiter: ext === '.tsv' ? '\t' : ',',
      relax_column_count: true,
    });
    const headers = records.length ? Object.keys(records[0]) : [];
    return { rows: records, headers };
  }
  if (ext === '.xlsx' || ext === '.xls') {
    const wb = XLSX.readFile(filePath);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
    const headers = rows.length ? Object.keys(rows[0]) : [];
    return { rows, headers };
  }
  throw new Error(`Unsupported file type: ${ext} (use .csv, .tsv, or .xlsx)`);
}

// --- Existing-lead lookup for cross-run dedupe ------------------------------

async function loadExistingKeys(db) {
  const keys = new Set();
  const pageSize = 1000;
  let from = 0;
  for (;;) {
    const { data, error } = await db
      .from('leads')
      .select('email, phone')
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`Failed to read existing leads: ${error.message}`);
    for (const row of data) {
      if (row.email) keys.add(`e:${row.email}`);
      if (row.phone) keys.add(`p:${row.phone}`);
    }
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return keys;
}

// Parse raw CSV/TSV text (e.g. from a browser upload) into rows + headers.
export function parseCsvText(text, delimiter = ',') {
  const records = parse(text, {
    columns: true, skip_empty_lines: true, trim: true, bom: true,
    delimiter, relax_column_count: true,
  });
  return { rows: records, headers: records.length ? Object.keys(records[0]) : [] };
}

// --- Main entry -------------------------------------------------------------

/**
 * Clean, dedupe, and store already-parsed rows. Shared by the CLI (file) and
 * the dashboard uploader (CSV text).
 * @param {object[]} rows     Row objects keyed by source header.
 * @param {string[]} headers  Source headers.
 * @param {object} opts { sourceName, dryRun }
 */
export async function storeRows(rows, headers, opts = {}) {
  const { sourceName = 'Imported list', dryRun = false } = opts;
  const { mapping, unmapped } = buildHeaderMapping(headers);

  const stats = {
    total: rows.length,
    unreachable: 0,
    dupInFile: 0,
    dupInDb: 0,
    toInsert: 0,
    inserted: 0,
  };

  if (!Object.values(mapping).includes('email') &&
      !Object.values(mapping).includes('phone')) {
    throw new Error(
      `No email or phone column found. Headers seen: ${headers.join(', ')}`
    );
  }

  // Normalize + dedupe within the file.
  const seen = new Set();
  const cleaned = [];
  for (const row of rows) {
    const lead = normalizeRow(row, mapping, unmapped);
    if (!isReachable(lead)) { stats.unreachable++; continue; }
    const key = dedupeKey(lead);
    if (seen.has(key)) { stats.dupInFile++; continue; }
    seen.add(key);
    cleaned.push(lead);
  }

  const result = {
    stats, mapping, unmapped,
    sourceName,
    dryRun,
    sourceId: null,
  };

  // Dedupe against the database (skip in dry-run to avoid needing credentials).
  if (dryRun) {
    stats.toInsert = cleaned.length;
    result.sample = cleaned.slice(0, 5);
    return result;
  }

  const db = getDb();
  const existing = await loadExistingKeys(db);
  const fresh = cleaned.filter((lead) => !existing.has(dedupeKey(lead)));
  stats.dupInDb = cleaned.length - fresh.length;
  stats.toInsert = fresh.length;

  if (fresh.length === 0) return result;

  // Record the source batch.
  const { data: source, error: srcErr } = await db
    .from('lead_sources')
    .insert({ name: sourceName, lead_count: fresh.length })
    .select('id')
    .single();
  if (srcErr) throw new Error(`Failed to create lead source: ${srcErr.message}`);
  result.sourceId = source.id;

  // Insert in batches.
  for (let i = 0; i < fresh.length; i += INSERT_BATCH) {
    const batch = fresh.slice(i, i + INSERT_BATCH)
      .map((lead) => ({ ...lead, source_id: source.id }));
    const { error } = await db.from('leads').insert(batch);
    if (error) throw new Error(`Insert failed at row ${i}: ${error.message}`);
    stats.inserted += batch.length;
  }

  return result;
}

/**
 * Read a CSV/XLSX file and store it (CLI path).
 */
export async function importLeads(filePath, opts = {}) {
  const { rows, headers } = readRows(filePath);
  return storeRows(rows, headers, { sourceName: path.basename(filePath), ...opts });
}

/**
 * Import from raw CSV/TSV text (dashboard upload path).
 */
export async function importCsvText(text, opts = {}) {
  const delimiter = opts.delimiter || (text.indexOf('\t') > -1 && text.indexOf(',') === -1 ? '\t' : ',');
  const { rows, headers } = parseCsvText(text, delimiter);
  return storeRows(rows, headers, opts);
}

export default importLeads;

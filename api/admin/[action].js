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
import { importCsvText } from '../../src/leads/import.js';
import { generateAndSendEmail } from '../../src/channels/email/aiSend.js';
import { generateAndSendSms } from '../../src/channels/sms/aiSend.js';
import { callLead } from '../../src/channels/voice/call.js';
import { pollInbox } from '../../src/channels/email/poll.js';
import { addSuppression } from '../../src/channels/suppression.js';
import { resolveMx } from 'node:dns/promises';

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
          fromAddress: config.email.fromAddress || '(not set)',
          smtpUser: config.email.smtp.user || '(not set)',
          dryRun: config.limits.dryRun,
          maxEmailsPerDay: config.limits.maxEmailsPerDay,
        };
        try {
          const { count, error } = await getDb().from('leads').select('*', { count: 'exact', head: true });
          out.leadCount = error ? ('ERROR: ' + error.message) : count;
        } catch (e) { out.leadCount = 'ERROR: ' + e.message; }
        return res.status(200).json(out);
      }
      case 'import': {
        if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
        const b = jsonBody(req) || {};
        if (!b.csv || typeof b.csv !== 'string') return res.status(400).json({ error: 'need { csv, sourceName }' });
        const result = await importCsvText(b.csv, { sourceName: b.sourceName || 'Uploaded list' });
        return res.status(200).json(result);
      }
      case 'send-test': {
        if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
        const b = jsonBody(req) || {};
        const email = String(b.email || '').trim().toLowerCase();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
          return res.status(400).json({ error: 'valid email required' });
        }
        const db = getDb();
        const found = await db.from('leads').select('*').eq('email', email).limit(1);
        let lead = found.data && found.data[0];
        if (!lead) {
          const ins = await db.from('leads')
            .insert({ email, first_name: 'Test', status: 'new' }).select('*').single();
          if (ins.error) return res.status(500).json({ error: ins.error.message });
          lead = ins.data;
        }
        const result = await generateAndSendEmail({
          lead, stepPrompt: 'A short, friendly test email introducing the product.',
        });
        return res.status(200).json(result);
      }
      case 'send-sms-test': {
        if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
        const b = jsonBody(req) || {};
        const phone = String(b.phone || '').trim();
        if (!/^\+?[0-9]{10,15}$/.test(phone.replace(/[\s()-]/g, ''))) {
          return res.status(400).json({ error: 'valid phone (E.164, e.g. +13305551234) required' });
        }
        const db = getDb();
        const found = await db.from('leads').select('*').eq('phone', phone).limit(1);
        let lead = found.data && found.data[0];
        if (!lead) {
          const ins = await db.from('leads')
            .insert({ phone, first_name: 'Test', status: 'new' }).select('*').single();
          if (ins.error) return res.status(500).json({ error: ins.error.message });
          lead = ins.data;
        }
        return res.status(200).json(await generateAndSendSms({ lead, stepPrompt: 'A short, friendly test text.' }));
      }
      case 'send-call-test': {
        if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
        const b = jsonBody(req) || {};
        const phone = String(b.phone || '').trim();
        if (!/^\+?[0-9]{10,15}$/.test(phone.replace(/[\s()-]/g, ''))) {
          return res.status(400).json({ error: 'valid phone (E.164) required' });
        }
        const db = getDb();
        const found = await db.from('leads').select('*').eq('phone', phone).limit(1);
        let lead = found.data && found.data[0];
        if (!lead) {
          const ins = await db.from('leads')
            .insert({ phone, first_name: 'Test', status: 'new' }).select('*').single();
          if (ins.error) return res.status(500).json({ error: ins.error.message });
          lead = ins.data;
        }
        return res.status(200).json(await callLead({ lead, stepPrompt: 'A short, friendly test call.' }));
      }
      case 'mx-test': {
        const domains = ['gmail.com', 'airphysicaltherapy.com', 'thisdomaindoesnotexist-xyz987654.com', 'no-such-clinic-zzz.com'];
        const out = {};
        for (const d of domains) {
          try { const mx = await resolveMx(d); out[d] = (mx && mx.length) ? 'VALID' : 'NO-MX (dead)'; }
          catch (e) { out[d] = 'DEAD (' + (e.code || 'err') + ')'; }
        }
        return res.status(200).json(out);
      }
      case 'scrub-stats': {
        const db = getDb();
        const toCheck = await db.from('leads').select('id', { count: 'exact', head: true })
          .eq('status', 'new').eq('scrubbed', false).not('email', 'is', null);
        return res.status(200).json({ to_check: toCheck.count || 0 });
      }
      case 'scrub': {
        if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
        const b = jsonBody(req) || {};
        const n = Math.min(Math.max(parseInt(b.n, 10) || 100, 1), 200);
        const db = getDb();
        const { data: leads, error } = await db.from('leads')
          .select('id, email').eq('status', 'new').eq('scrubbed', false)
          .not('email', 'is', null).limit(n);
        if (error) return res.status(500).json({ error: error.message });
        const mxCache = new Map();
        let removed = 0, kept = 0;
        for (const lead of leads) {
          const email = String(lead.email).toLowerCase();
          const syntaxOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
          const domain = email.split('@')[1] || '';
          let valid = syntaxOk;
          if (valid) {
            if (mxCache.has(domain)) valid = mxCache.get(domain);
            else {
              try {
                const mx = await resolveMx(domain);
                valid = !!(mx && mx.length);
              } catch (e) {
                // dead domain -> invalid; transient error -> keep (assume valid)
                valid = !(e && (e.code === 'ENOTFOUND' || e.code === 'ENODATA'));
              }
              mxCache.set(domain, valid);
            }
          }
          if (valid) {
            await db.from('leads').update({ scrubbed: true }).eq('id', lead.id);
            kept++;
          } else {
            await db.from('leads').update({ scrubbed: true, status: 'unqualified' }).eq('id', lead.id);
            await addSuppression({ email, scope: 'all', reason: 'bounce', note: 'scrub: bad address/domain' });
            removed++;
          }
        }
        const rem = await db.from('leads').select('id', { count: 'exact', head: true })
          .eq('status', 'new').eq('scrubbed', false).not('email', 'is', null);
        return res.status(200).json({ checked: leads.length, kept, removed, remaining: rem.count || 0 });
      }
      case 'export-emails': {
        const db = getDb();
        const rows = [];
        let from = 0; const page = 1000;
        for (;;) {
          const { data, error } = await db.from('leads')
            .select('email, first_name, last_name, organization, status')
            .not('email', 'is', null).range(from, from + page - 1);
          if (error) return res.status(500).json({ error: error.message });
          rows.push(...data);
          if (data.length < page) break;
          from += page;
        }
        const q = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
        const csv = 'email,first_name,last_name,organization,status\n' +
          rows.map((r) => [r.email, r.first_name, r.last_name, r.organization, r.status].map(q).join(',')).join('\n');
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="cowboy-leads.csv"');
        return res.status(200).send(csv);
      }
      case 'batch-stats': {
        const db = getDb();
        const unsent = await db.from('leads').select('id', { count: 'exact', head: true })
          .eq('status', 'new').not('email', 'is', null);
        const sent = await db.from('leads').select('id', { count: 'exact', head: true })
          .neq('status', 'new').not('email', 'is', null);
        return res.status(200).json({ unsent: unsent.count || 0, sent: sent.count || 0 });
      }
      case 'send-batch': {
        if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
        const b = jsonBody(req) || {};
        // Small per-call chunk so the serverless call finishes in time; the
        // dashboard loops this to reach the full batch (e.g. 200).
        const n = Math.min(Math.max(parseInt(b.n, 10) || 4, 1), 5);
        const db = getDb();
        const { data: leads, error } = await db.from('leads').select('*')
          .eq('status', 'new').not('email', 'is', null)
          .order('created_at', { ascending: true }).limit(n);
        if (error) return res.status(500).json({ error: error.message });
        let sent = 0, failed = 0, capped = false;
        for (const lead of leads) {
          let r;
          try { r = await generateAndSendEmail({ lead }); }
          catch (e) { r = { sent: false, reason: e.message }; } // one bad email never stops the batch
          if (r.reason === 'daily_cap_reached') { capped = true; break; }
          // Mark touched either way so the batch advances and never re-sends.
          await db.from('leads').update({ status: r.sent ? 'active' : 'unqualified' }).eq('id', lead.id);
          if (r.sent) sent++; else failed++;
        }
        const rem = await db.from('leads').select('id', { count: 'exact', head: true })
          .eq('status', 'new').not('email', 'is', null);
        return res.status(200).json({ sent, failed, capped, remaining: rem.count || 0 });
      }
      case 'poll-inbox': {
        return res.status(200).json(await pollInbox({ limit: 25 }));
      }
      case 'sms-status': {
        const db = getDb();
        const { data } = await db.from('messages')
          .select('provider_id, to_address, from_address, created_at')
          .eq('channel', 'sms').eq('direction', 'outbound')
          .not('provider_id', 'is', null)
          .order('created_at', { ascending: false }).limit(1);
        const sid = data && data[0] && data[0].provider_id;
        if (!sid) return res.status(200).json({ error: 'no SMS with a Twilio SID yet' });
        const asid = config.phone.twilioAccountSid;
        const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${asid}/Messages/${sid}.json`, {
          headers: { Authorization: 'Basic ' + Buffer.from(`${asid}:${config.phone.twilioAuthToken}`).toString('base64') },
        });
        const j = await r.json();
        return res.status(200).json({
          to: data[0].to_address, from: data[0].from_address,
          status: j.status, error_code: j.error_code, error_message: j.error_message,
        });
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

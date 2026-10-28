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

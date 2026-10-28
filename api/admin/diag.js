// Safe diagnostic: reports which Supabase key is configured (its role claim or
// key prefix - never the key itself) and whether the DB is readable. Helps catch
// the common mistake of pasting the publishable/anon key as the service key.
import config from '../../src/config/index.js';
import { getDb } from '../../src/db/client.js';

function keyRole(k) {
  if (!k) return 'MISSING';
  if (k.startsWith('sb_publishable')) return 'publishable (WRONG - that is the public key)';
  if (k.startsWith('sb_secret')) return 'secret (ok)';
  const parts = k.split('.');
  if (parts.length === 3) {
    try { return (JSON.parse(Buffer.from(parts[1], 'base64url').toString()).role) || 'jwt(no role)'; }
    catch { return 'jwt(undecodable)'; }
  }
  return 'unknown-format';
}

export default async function handler(req, res) {
  const out = {
    hasUrl: !!config.db.url,
    urlRef: (config.db.url || '').replace(/^https?:\/\//, '').split('.')[0],
    schema: config.db.schema,
    serviceKeyRole: keyRole(config.db.serviceRoleKey),
    hasAnthropicKey: !!config.ai.anthropicApiKey,
    emailProvider: config.email.provider,
    dryRun: config.limits.dryRun,
  };
  try {
    const { count, error } = await getDb().from('leads').select('*', { count: 'exact', head: true });
    out.leadCount = error ? ('ERROR: ' + error.message) : count;
  } catch (e) { out.leadCount = 'ERROR: ' + e.message; }
  res.status(200).json(out);
}

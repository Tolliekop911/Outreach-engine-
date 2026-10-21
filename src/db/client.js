// Supabase client scoped to our `outreach` schema. Uses the service role key,
// so it must only ever run server-side / in trusted scripts, never in a browser.
import { createClient } from '@supabase/supabase-js';
import config from '../config/index.js';

let client = null;

export function getDb() {
  if (client) return client;
  if (!config.db.url || !config.db.serviceRoleKey) {
    throw new Error(
      'Supabase not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.'
    );
  }
  client = createClient(config.db.url, config.db.serviceRoleKey, {
    db: { schema: config.db.schema },
    auth: { persistSession: false },
  });
  return client;
}

export default getDb;

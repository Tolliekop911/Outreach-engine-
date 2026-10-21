// Shared suppression checks. Every channel must consult this before sending.
// A suppression row with channel_scope 'all' blocks every channel; a specific
// scope ('email'|'sms'|'voice') blocks only that one.
import { getDb } from '../db/client.js';

export async function isSuppressed({ email, phone, channel }) {
  const db = getDb();
  const scopes = ['all'];
  if (channel) scopes.push(channel);

  if (email) {
    const { data, error } = await db
      .from('suppression')
      .select('id')
      .eq('email', email.toLowerCase())
      .in('channel_scope', scopes)
      .limit(1);
    if (error) throw new Error(`Suppression check failed: ${error.message}`);
    if (data.length) return true;
  }
  if (phone) {
    const { data, error } = await db
      .from('suppression')
      .select('id')
      .eq('phone', phone)
      .in('channel_scope', scopes)
      .limit(1);
    if (error) throw new Error(`Suppression check failed: ${error.message}`);
    if (data.length) return true;
  }
  return false;
}

// Add (idempotently) a suppression entry. scope defaults to 'all'.
export async function addSuppression({ email, phone, scope = 'all', reason, note }) {
  const db = getDb();
  const row = {
    email: email ? email.toLowerCase() : null,
    phone: phone || null,
    channel_scope: scope,
    reason,
    note: note || null,
  };
  // Unique indexes make this a no-op if the entry already exists.
  const { error } = await db
    .from('suppression')
    .upsert(row, {
      onConflict: email ? 'email,channel_scope' : 'phone,channel_scope',
      ignoreDuplicates: true,
    });
  if (error) throw new Error(`Failed to add suppression: ${error.message}`);
}

// Data layer for the digital-signage ad system (outreach.signage_ads).
import { getDb } from '../db/client.js';

export async function listAds({ screen = '', activeOnly = false } = {}) {
  const db = getDb();
  let q = db.from('signage_ads')
    .select('id, screen, media_url, media_type, duration_sec, sort, active, caption, created_at')
    .order('screen', { ascending: true })
    .order('sort', { ascending: true })
    .order('created_at', { ascending: true });
  if (screen) q = q.eq('screen', screen);
  if (activeOnly) q = q.eq('active', true);
  const { data, error } = await q;
  if (error) throw new Error(`listAds failed: ${error.message}`);
  return data;
}

export async function addAd({ screen, media_url, media_type, duration_sec, caption, sort }) {
  if (!media_url) throw new Error('media_url is required');
  const type = media_type || (/\.(mp4|webm|mov|m4v)(\?|$)/i.test(media_url) ? 'video' : 'image');
  const db = getDb();
  const { data, error } = await db.from('signage_ads').insert({
    screen: (screen || 'default').trim() || 'default',
    media_url: media_url.trim(),
    media_type: type,
    duration_sec: Math.max(2, parseInt(duration_sec, 10) || 10),
    caption: caption || null,
    sort: parseInt(sort, 10) || 0,
  }).select('*').single();
  if (error) throw new Error(`addAd failed: ${error.message}`);
  return data;
}

export async function removeAd(id) {
  const db = getDb();
  const { error } = await db.from('signage_ads').delete().eq('id', id);
  if (error) throw new Error(`removeAd failed: ${error.message}`);
  return { removed: true };
}

export async function setActive(id, active) {
  const db = getDb();
  const { data, error } = await db.from('signage_ads')
    .update({ active: !!active }).eq('id', id).select('id, active').single();
  if (error) throw new Error(`setActive failed: ${error.message}`);
  return data;
}

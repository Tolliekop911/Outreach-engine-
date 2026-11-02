// Signage API. `playlist` is public (screens read it with no auth); the rest
// manage ads. Single function to stay under the serverless-function cap.
import { jsonBody } from '../_lib.js';
import { listAds, addAd, removeAd, setActive } from '../../src/signage/store.js';

export default async function handler(req, res) {
  const action = req.query.action;
  try {
    switch (action) {
      case 'playlist': {
        const screen = (req.query.screen || 'default').toString();
        const ads = await listAds({ screen, activeOnly: true });
        res.setHeader('Cache-Control', 'no-store');
        return res.status(200).json({ screen, ads });
      }
      case 'list':
        return res.status(200).json({ ads: await listAds({}) });
      case 'add': {
        if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
        return res.status(200).json(await addAd(jsonBody(req) || {}));
      }
      case 'remove': {
        if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
        const b = jsonBody(req) || {};
        if (!b.id) return res.status(400).json({ error: 'id required' });
        return res.status(200).json(await removeAd(b.id));
      }
      case 'toggle': {
        if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
        const b = jsonBody(req) || {};
        if (!b.id) return res.status(400).json({ error: 'id required' });
        return res.status(200).json(await setActive(b.id, b.active));
      }
      default:
        return res.status(404).json({ error: 'unknown signage action' });
    }
  } catch (e) {
    console.error(`signage ${action} failed:`, e.message);
    res.status(500).json({ error: e.message });
  }
}

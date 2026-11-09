// Poll the Namecheap mailbox over IMAP for unread replies and feed each into
// the inbound handler (classify -> auto-respond / suppress / flag hot lead).
// Marks each processed message as seen so it is handled once.
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import config from '../../config/index.js';
import { handleInboundEmail, isBounce, handleBounce } from './inbound.js';

export async function pollInbox({ limit = 25 } = {}) {
  const { host, port, user, pass } = config.email.imap;
  if (!user || !pass) return { skipped: true, reason: 'imap_not_configured' };

  const client = new ImapFlow({
    host, port, secure: true, auth: { user, pass }, logger: false,
  });

  const stats = { processed: 0, acted: [] };
  await client.connect();
  const lock = await client.getMailboxLock('INBOX');
  try {
    const uids = await client.search({ seen: false }, { uid: true });
    const take = (uids || []).slice(0, limit);
    for (const uid of take) {
      const msg = await client.fetchOne(uid, { source: true }, { uid: true });
      if (!msg || !msg.source) continue;
      const parsed = await simpleParser(msg.source);
      const from = parsed.from?.value?.[0]?.address || '';
      const subject = parsed.subject || '';
      const text = (parsed.text || parsed.html || '').toString();
      try {
        if (isBounce(from, subject)) {
          const res = await handleBounce(text);
          stats.acted.push({ from, bounce: true, suppressed: res.suppressed });
        } else {
          const res = await handleInboundEmail({ from, subject, text, providerId: parsed.messageId });
          stats.acted.push({ from, matched: res.matched, category: res.category, action: res.action });
        }
      } catch (e) {
        console.error('inbound handling failed for', from, e.message);
      }
      await client.messageFlagsAdd(uid, ['\\Seen'], { uid: true });
      stats.processed++;
    }
  } finally {
    lock.release();
    await client.logout().catch(() => {});
  }
  return stats;
}

export default pollInbox;

// SMTP adapter (e.g. Namecheap Private Email). Sends through a real mailbox
// over SMTP using nodemailer. Suited to modest volume with conservative daily
// caps - a mailbox host is not a bulk sender (see README deliverability note).
import nodemailer from 'nodemailer';
import config from '../../../config/index.js';

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  const { host, port, secure, user, pass } = config.email.smtp;
  if (!user || !pass) {
    throw new Error('SMTP_USER / SMTP_PASS are not set.');
  }
  transporter = nodemailer.createTransport({
    host, port, secure,
    auth: { user, pass },
  });
  return transporter;
}

// Build the nodemailer message object. Pure, so it is unit-testable.
export function buildMessage({ from, fromName, to, subject, html }) {
  return {
    from: fromName ? `"${fromName}" <${from}>` : from,
    to,
    subject,
    html,
  };
}

export const smtpProvider = {
  name: 'smtp',
  async send(args) {
    const info = await getTransporter().sendMail(buildMessage(args));
    return { providerId: info.messageId || null };
  },
};

export default smtpProvider;

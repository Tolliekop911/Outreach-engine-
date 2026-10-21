// SendGrid adapter (v3 Mail Send API). Requires EMAIL_API_KEY.
// We disable SendGrid's own click/open tracking because we do our own, so link
// rewriting and the pixel stay under our control and in our database.
import config from '../../../config/index.js';

export const sendgridProvider = {
  name: 'sendgrid',
  async send({ from, fromName, to, subject, html }) {
    if (!config.email.apiKey) {
      throw new Error('EMAIL_API_KEY (SendGrid) is not set.');
    }
    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.email.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: from, name: fromName || undefined },
        subject,
        content: [{ type: 'text/html', value: html }],
        tracking_settings: {
          click_tracking: { enable: false },
          open_tracking: { enable: false },
        },
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`SendGrid send failed (${res.status}): ${detail.slice(0, 300)}`);
    }
    // SendGrid returns the message id in the X-Message-Id header.
    const providerId = res.headers.get('x-message-id') || null;
    return { providerId };
  },
};

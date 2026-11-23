// Branded HTML email template. The AI writes the body copy; this wraps it in the
// Cowboy Systems layout (logo, greeting, CTA, feature list, signature, BBB badge,
// footer + unsubscribe + open pixel). Table-based, inline styles for email
// clients (Gmail/Outlook/Apple Mail).
import config from '../../config/index.js';
import { clickUrl, unsubscribeUrl, openPixelUrl, rewriteLinks } from './tracking.js';

const FEATURES = [
  'Website & Widget', 'Custom App', 'Scheduling & POS', '2027 EMR',
  'Billing & RTM', 'AI Physical Therapy & Reception Agent', 'Marketing Engine',
];

const INK = '#17203a';
const MUTE = '#5b6b86';
const TEAL = '#2bb6a6';
const LINE = '#e6e9f0';

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Give the AI-written <p>/<a> tags inline styles so clients render them right.
function styleBody(html) {
  return String(html || '')
    .replace(/<p>/gi, `<p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:${INK}">`)
    .replace(/<a /gi, `<a style="color:${TEAL};text-decoration:underline" `);
}

function webHref(url) {
  if (!url) return '';
  return url.startsWith('http') ? url : `https://${url}`;
}

function bbbBadge(o, messageId) {
  const link = clickUrl(messageId, webHref(o.bbbUrl || 'https://www.bbb.org'));
  if (o.bbbSealUrl) {
    return `<a href="${link}"><img src="${esc(o.bbbSealUrl)}" alt="BBB Accredited Business" height="56" style="border:0;display:inline-block"></a>`;
  }
  // Clean text badge fallback until the official seal URL is set.
  return `<a href="${link}" style="text-decoration:none"><span style="display:inline-block;border:2px solid #0a4d8c;border-radius:8px;padding:9px 14px;font-family:Arial,Helvetica,sans-serif;line-height:16px"><span style="color:#0a4d8c;font-weight:800;font-size:16px;letter-spacing:.03em;vertical-align:middle">BBB</span><span style="color:${INK};font-weight:700;font-size:11px;letter-spacing:.04em;margin-left:7px;vertical-align:middle">ACCREDITED&nbsp;BUSINESS</span></span></a>`;
}

export function renderEmail({ lead, html, messageId }) {
  const o = config.outreach;
  const first = esc(lead.first_name || 'there');
  const body = styleBody(rewriteLinks(html || '', messageId));
  const ctaHref = clickUrl(messageId, webHref(o.ctaUrl || o.website));
  const unsub = unsubscribeUrl(messageId, lead.id, lead.email);
  const pixel = openPixelUrl(messageId);
  const site = esc(o.website || '');
  const siteHref = clickUrl(messageId, webHref(o.website));
  const phone = esc(o.phone || '');
  const fromEmail = esc(config.email.fromAddress || '');

  const features = FEATURES.map((f) =>
    `<tr><td style="padding:3px 0;font-size:15px;color:${INK};font-family:Arial,Helvetica,sans-serif">
       <span style="color:${TEAL}">&#8226;</span>&nbsp;&nbsp;${esc(f)}</td></tr>`).join('');

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#f4f6fb">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fb">
 <tr><td align="center" style="padding:28px 12px">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid ${LINE}">
   <tr><td style="height:5px;background:#c8a86a;font-size:0;line-height:0">&nbsp;</td></tr>
   <tr><td style="padding:34px 28px 0">
     <div style="font-family:Arial,Helvetica,sans-serif"><span style="font-size:24px;font-weight:800;color:${INK}">Cowboy</span>
       <span style="font-size:14px;font-weight:700;letter-spacing:.22em;color:${MUTE}">&nbsp;SYSTEMS</span></div>
   </td></tr>
   <tr><td style="padding:26px 28px 0;font-family:Arial,Helvetica,sans-serif">
     <div style="font-size:19px;font-weight:700;color:${INK};margin-bottom:14px">Hey ${first},</div>
     ${body}
   </td></tr>
   <tr><td style="padding:10px 28px 6px">
     <table role="presentation" cellpadding="0" cellspacing="0"><tr>
       <td align="center" bgcolor="${INK}" style="border-radius:40px">
         <a href="${ctaHref}" style="display:inline-block;padding:16px 34px;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none">Schedule your 15-minute call</a>
       </td></tr></table>
   </td></tr>
   <tr><td style="padding:20px 28px 0">
     <table role="presentation" cellpadding="0" cellspacing="0">${features}</table>
   </td></tr>
   <tr><td style="padding:26px 28px 0;font-family:Arial,Helvetica,sans-serif;font-size:15px;color:${MUTE}">Thank you for your time,</td></tr>
   <tr><td style="padding:8px 28px 0;font-family:Arial,Helvetica,sans-serif">
     <div style="font-size:16px;font-weight:700;color:${INK}">${esc(o.signaturePerson)}</div>
     <div style="font-size:15px;color:${MUTE}">${esc(o.signatureName)}</div>
   </td></tr>
   <tr><td style="padding:22px 28px 0">${bbbBadge(o, messageId)}</td></tr>
   <tr><td style="padding:22px 28px 30px">
     <div style="border-top:1px solid ${LINE};padding-top:18px;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#9aa6bb">
       ${phone} &middot; <a href="${siteHref}" style="color:#9aa6bb;text-decoration:underline">${site}</a>
       &middot; <a href="mailto:${fromEmail}" style="color:#9aa6bb;text-decoration:underline">${fromEmail}</a><br>
       ${esc(config.email.postalAddress || '')}<br>
       <a href="${unsub}" style="color:#9aa6bb;text-decoration:underline">Unsubscribe</a>
     </div>
   </td></tr>
  </table>
 </td></tr>
</table>
<img src="${pixel}" width="1" height="1" alt="" style="display:none">
</body></html>`;
}

export default renderEmail;

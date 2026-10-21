// Central config. Reads from environment; see .env.example for the full list.
// Everything the engine connects to (AI, phone numbers, email, database) is
// wired here so the rest of the code never hardcodes a provider or number.

const env = process.env;

function list(value) {
  return (value || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function int(value, fallback) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

export const config = {
  ai: {
    provider: env.AI_PROVIDER || 'anthropic',
    model: env.AI_MODEL || 'claude-opus-5-5',
    effort: env.AI_EFFORT || 'medium',
    anthropicApiKey: env.ANTHROPIC_API_KEY || '',
  },
  // The pitch the AI writes from. Kept here, never hardcoded in prompts, so the
  // same engine can sell a different product without code changes.
  outreach: {
    senderName: env.OUTREACH_SENDER_NAME || '',
    senderTitle: env.OUTREACH_SENDER_TITLE || '',
    product: env.OUTREACH_PRODUCT || '',
    valueProp: env.OUTREACH_VALUE_PROP || '',
    cta: env.OUTREACH_CTA || '',
    ctaUrl: env.OUTREACH_CTA_URL || '',
  },
  db: {
    url: env.SUPABASE_URL || '',
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY || '',
    // We share the Cowboy Mind project but live entirely in our own schema.
    schema: env.DB_SCHEMA || 'outreach',
  },
  phone: {
    twilioAccountSid: env.TWILIO_ACCOUNT_SID || '',
    twilioAuthToken: env.TWILIO_AUTH_TOKEN || '',
    numbers: list(env.OUTREACH_PHONE_NUMBERS),
  },
  email: {
    provider: env.EMAIL_PROVIDER || 'console',
    apiKey: env.EMAIL_API_KEY || '',
    fromAddress: env.EMAIL_FROM_ADDRESS || '',
    fromName: env.EMAIL_FROM_NAME || '',
    postalAddress: env.EMAIL_POSTAL_ADDRESS || '',
  },
  tracking: {
    baseUrl: (env.TRACKING_BASE_URL || '').replace(/\/$/, ''),
    secret: env.TRACKING_SECRET || '',
    port: int(env.PORT, 3000),
  },
  limits: {
    maxEmailsPerDay: int(env.MAX_EMAILS_PER_DAY, 500),
    maxSmsPerDay: int(env.MAX_SMS_PER_DAY, 200),
    maxCallsPerDay: int(env.MAX_CALLS_PER_DAY, 100),
    // Safety default: nothing actually sends until DRY_RUN is explicitly false.
    dryRun: env.DRY_RUN !== 'false',
  },
};

export default config;

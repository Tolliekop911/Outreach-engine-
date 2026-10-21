# Cowboy Outreach Engine

AI-driven lead outreach automation. Takes a list of leads, then automatically
reaches out across email, text message, and phone call, using our AI to write,
personalize, and respond. Built to run the ~15,000 APTA CSM leads we plan to
buy next year as one coordinated, automated campaign.

This is a standalone project. It does not touch the Cowboy Healthcare EHR or the
existing marketing platform. It connects to our AI models and our phone numbers
through configuration only (see `src/config/`).

## What it does

1. **Ingest leads** from a purchased list (CSV/XLSX from APTA CSM, etc.), clean
   and dedupe them, and store them in the database.
2. **Segment** leads into audiences (by specialty, state, clinic size, etc.).
3. **Run campaigns**: multi-step sequences across channels with delays and
   branching (email -> wait -> text -> wait -> call).
4. **AI-generate** every message, personalized per lead, and **AI-respond** to
   replies in the inbox.
5. **Track** opens, clicks, replies, call outcomes, opt-outs, and conversions.

## Channels

- **Email** - bulk + transactional sending with open/click/reply tracking.
- **SMS** - our phone numbers (Twilio) for texts and inbound handling.
- **Voice** - AI voice calls / voicemail drops through our phone numbers.

## Architecture (planned)

```
data/leads/        Raw purchased lists dropped here for import
src/
  config/          AI provider, phone numbers, sending limits, secrets wiring
  leads/           Import, clean, dedupe, store, segment
  channels/        email / sms / voice senders + inbound webhooks
  ai/              Message generation, reply classification, auto-responses
  pipeline/        Campaign sequences, scheduling, throttling, state machine
scripts/           One-off and operational scripts (import, backfill, reports)
docs/              Specs, compliance notes, campaign playbooks
```

Stack intent (to confirm): Node + Supabase (Postgres) + Vercel, mirroring the
rest of our systems, with Twilio for SMS/voice.

## Compliance (must-read before first send)

Cold outreach to purchased lists is regulated. Before any real send we need:

- **Email (CAN-SPAM):** valid physical mailing address in every email, clear
  sender identity, working one-click unsubscribe honored promptly.
- **SMS/Voice (TCPA):** texting and calling purchased lists has real legal
  risk. Prior express consent rules, quiet hours, opt-out ("STOP") handling,
  and Do-Not-Call scrubbing all apply. We treat SMS/voice as consent-gated and
  wire opt-out suppression before enabling those channels.
- **Suppression list:** global opt-out / bounce / complaint list that every
  channel checks before sending.

See `docs/compliance.md` for the working checklist.

## Importing a lead list

Drop the purchased file in `data/leads/` (gitignored), then:

```
npm install
node scripts/import-leads.js data/leads/your-list.csv --source "APTA CSM 2027" --dry-run
```

`--dry-run` cleans and reports counts (mapped columns, junk dropped, duplicates)
without writing anything or needing credentials. Always dry-run a new list
first; drop `--dry-run` to write to the database (needs SUPABASE_* in `.env`).
Supports `.csv`, `.tsv`, and `.xlsx`. Unknown columns are preserved per lead in
a `custom` JSON field. Rows with no usable email or phone are skipped, and
duplicates (by email, else phone) are collapsed within the file and against the
database.

## Email channel

Provider-agnostic. Set `EMAIL_PROVIDER` to `console` (logs, no send),
`smtp` (Namecheap Private Email or any mailbox), or `sendgrid`. For SMTP set
`SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` / `SMTP_USER` / `SMTP_PASS`
(defaults target `mail.privateemail.com:465`). Every send:

- checks the global suppression list first and skips suppressed addresses,
- respects `MAX_EMAILS_PER_DAY` and the `DRY_RUN` safety switch,
- injects an open-tracking pixel, rewrites links through a signed click
  redirect, and appends a CAN-SPAM footer (postal address + unsubscribe).

Tracking and unsubscribe need the webhook server running and reachable at
`TRACKING_BASE_URL`:

```
npm run server
```

Endpoints: `/t/open/:token.gif`, `/t/click/:token` (302 to the signed target),
`/u/:token` (one-click unsubscribe -> suppression), `/webhooks/email` (provider
bounce/complaint events -> suppression). Tokens are HMAC-signed with
`TRACKING_SECRET`; tampered or forged tokens are rejected.

## AI message generation

Claude writes a personalized email per lead. The pitch (sender, product, value
prop, CTA) lives in config (`OUTREACH_*`), never hardcoded in prompts, so the
same engine can sell a different product without code changes. Generation:

- builds the prompt from the brand/offer context and the lead's fields
  (including any `custom` columns) plus optional per-step guidance,
- returns a subject and an HTML body, parsed defensively from the model,
- is instructed not to invent facts or add a signature/unsubscribe/footer
  (the email channel appends those), and handles safety refusals.

**SMTP deliverability (important):** Namecheap Private Email is a mailbox
service, not a bulk sender. It enforces per-hour/day send limits and its terms
discourage unsolicited bulk mail, so sending thousands of cold emails through it
risks throttling or account suspension and poor inbox placement. Keep
`MAX_EMAILS_PER_DAY` low, warm up slowly, make sure the domain has SPF/DKIM/DMARC
set, and consider a dedicated subdomain. For true volume, a provider that
permits cold outreach is the safer path.

**Inbound replies over Namecheap:** Private Email has no inbound webhook, so
`/webhooks/inbound-email` needs an IMAP poller that reads the mailbox and posts
new messages to it (not built yet - next step).

Default model is `claude-opus-5-5`; set `AI_MODEL=claude-sonnet-5-5` or
`claude-haiku-5-5` for cheaper bulk generation. Needs `ANTHROPIC_API_KEY`.
`generateAndSendEmail()` ties generation to the tracked, suppression-checked,
DRY_RUN-safe send.

## Campaigns and the scheduler

A campaign targets an audience and has ordered steps, each with a channel and a
`delay_minutes` wait. Enroll an audience, then run the scheduler on a cadence:

```
# enroll a campaign's audience
node scripts/run-campaigns.js --enroll <campaign-id>

# one tick (run every due step once) - put this on cron
node scripts/run-campaigns.js

# or loop locally every 60s; --dry-run simulates steps with no AI/send
node scripts/run-campaigns.js --loop 60 --dry-run
```

Each tick finds enrollments whose next action is due, runs the current step
(email generates with the AI and sends through the tracked, capped,
suppression-checked path; SMS/voice are stubbed until built), and advances the
enrollment to the next step's fire time or marks it complete. Paused/archived
campaigns are skipped, suppressed leads drop out, and hitting a channel's daily
cap stops the tick without losing position. Run one tick per cron invocation in
production.

## Inbound replies

Point your email provider's inbound-parse (or an IMAP bridge) at
`POST /webhooks/inbound-email` with `{ from, subject, text }`. Each reply is
matched to a lead, recorded, and classified:

- **opt_out** (also caught deterministically before any AI call) -> suppressed
  on all channels, sequence stopped.
- **interested** -> lead marked engaged, sequence stopped, flagged for a human
  (emails `OUTREACH_HANDOFF_EMAIL` if set). No salesy auto-reply.
- **question** -> AI drafts a grounded answer and sends it (tracked, DRY_RUN-safe).
- **not_interested / wrong_person / other** -> sequence stopped.
- **auto_reply** (out-of-office) -> ignored, sequence keeps running.

A genuine human reply always stops the automated sequence so no one keeps
getting blasted after they respond.

## Deployment (Vercel)

The webhooks run as serverless functions under `api/`, the root shows a small
status page (`public/index.html`), and the scheduler runs on Vercel Cron.
`vercel.json` maps the pretty paths and declares the cron.

Set these environment variables in the Vercel project (Settings -> Environment
Variables): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`,
`AI_MODEL`, `EMAIL_PROVIDER`, `EMAIL_API_KEY`, `EMAIL_FROM_ADDRESS`,
`EMAIL_FROM_NAME`, `EMAIL_POSTAL_ADDRESS`, `TRACKING_SECRET`, all `OUTREACH_*`,
and `CRON_SECRET`. Set `TRACKING_BASE_URL` to the deployed domain (e.g.
`https://outreach-engine-steel.vercel.app`) and `DRY_RUN=false` only when you
are ready to send.

Routes once deployed: `/` (status), `/health`, `/t/open/:token`,
`/t/click/:token`, `/u/:token`, `/webhooks/email`, `/webhooks/inbound-email`,
and `/api/tick` (cron-only, guarded by `CRON_SECRET`).

### Scheduling the tick

Vercel Hobby only allows once-daily cron, so the scheduler runs from **GitHub
Actions** (`.github/workflows/scheduler.yml`) every 15 minutes, which pings
`/api/tick`. Set two repository secrets (Settings -> Secrets and variables ->
Actions):
- `TICK_URL` = `https://<your-domain>/api/tick`
- `CRON_SECRET` = the same value set as `CRON_SECRET` in Vercel

Alternatives: upgrade to Vercel Pro and add a `crons` entry back to
`vercel.json`, or run the scheduler as a long-lived worker
(`npm run run-campaigns --loop 60`) on a VM.

Each `/api/tick` processes a small batch (25) to fit the function time limit;
daily caps still govern total volume.

## Status

Day 1 scaffold. No channels wired yet, no data imported. See `docs/roadmap.md`.

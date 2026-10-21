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

## Status

Day 1 scaffold. No channels wired yet, no data imported. See `docs/roadmap.md`.

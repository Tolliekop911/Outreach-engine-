# Roadmap

Target: have this fully operational before the APTA CSM leads (~15,000) land
next year, so the list can be imported and worked automatically from day one.

## Phase 0 - Foundation (now)
- [x] Project scaffold, config wiring, compliance checklist
- [ ] Confirm stack (Node + Supabase + Vercel + Twilio) and create Supabase project
- [ ] Database schema: leads, audiences, campaigns, messages, events, suppression
- [x] Lead import script (CSV/XLSX -> clean -> dedupe -> store)

## Phase 1 - Channels (one at a time, email first)
- [x] Email send + open/click tracking + unsubscribe (console + SendGrid adapters)
- [x] Global suppression list checked before every send
- [ ] Inbound reply capture for email (needs inbound-parse / IMAP wiring)
- [ ] SMS send/receive via our numbers, STOP handling (consent-gated)
- [ ] Voice calls / voicemail drops (consent-gated)

## Phase 2 - AI
- [x] AI message generation, personalized per lead (email; Claude)
- [ ] AI generation for SMS/voice scripts
- [ ] Inbound reply classification (interested / not / opt-out / question)
- [ ] AI auto-responses with human handoff for hot leads

## Phase 3 - Pipeline
- [x] Campaign sequence runner (multi-step, multi-channel, per-step delays)
- [x] Scheduler tick + enrollment, honoring daily caps and DRY_RUN
- [ ] Quiet-hours enforcement for SMS/voice steps
- [ ] Branching on engagement (opened / clicked / replied)
- [ ] Dashboard: deliverability, replies, call outcomes, conversions

## Open questions for the user
- Which email sending provider do we use? (deliverability for cold outreach matters)
- Do we reuse the shared Twilio number or get dedicated numbers for outreach?
- Separate Supabase project for this, or share an existing one?
- What counts as a conversion (booked demo, signed clinic, etc.)?

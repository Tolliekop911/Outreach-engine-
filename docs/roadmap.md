# Roadmap

Target: have this fully operational before the APTA CSM leads (~15,000) land
next year, so the list can be imported and worked automatically from day one.

## Phase 0 - Foundation (now)
- [x] Project scaffold, config wiring, compliance checklist
- [ ] Confirm stack (Node + Supabase + Vercel + Twilio) and create Supabase project
- [ ] Database schema: leads, audiences, campaigns, messages, events, suppression
- [ ] Lead import script (CSV/XLSX -> clean -> dedupe -> store)

## Phase 1 - Channels (one at a time, email first)
- [ ] Email send + open/click/reply tracking + unsubscribe
- [ ] Global suppression list checked before every send
- [ ] SMS send/receive via our numbers, STOP handling (consent-gated)
- [ ] Voice calls / voicemail drops (consent-gated)

## Phase 2 - AI
- [ ] AI message generation, personalized per lead
- [ ] Inbound reply classification (interested / not / opt-out / question)
- [ ] AI auto-responses with human handoff for hot leads

## Phase 3 - Pipeline
- [ ] Campaign sequence builder (multi-step, multi-channel, delays, branching)
- [ ] Scheduler + throttling honoring daily caps and quiet hours
- [ ] Dashboard: deliverability, replies, call outcomes, conversions

## Open questions for the user
- Which email sending provider do we use? (deliverability for cold outreach matters)
- Do we reuse the shared Twilio number or get dedicated numbers for outreach?
- Separate Supabase project for this, or share an existing one?
- What counts as a conversion (booked demo, signed clinic, etc.)?

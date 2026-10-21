# Compliance checklist

Cold outreach to a purchased list carries real legal exposure. Nothing in this
project sends to real people until the relevant boxes below are checked. The
engine ships with `DRY_RUN=true` so it cannot send by accident.

## Email - CAN-SPAM
- [ ] Valid physical postal address in every email footer
- [ ] Accurate "From" identity and non-deceptive subject lines
- [ ] Working unsubscribe link, honored within 10 business days
- [ ] Unsubscribes written to the global suppression list

## SMS and Voice - TCPA / TSR
- [ ] Legal review of texting/calling a purchased list (consent requirements)
- [ ] Prior express consent recorded where required
- [ ] Do-Not-Call scrub before any call campaign
- [ ] Quiet hours enforced (no contact before 8am / after 9pm local)
- [ ] "STOP" and verbal opt-out captured and suppressed immediately

## Across all channels
- [ ] Single global suppression list (opt-outs, bounces, complaints)
- [ ] Every send checks suppression first
- [ ] Per-lead contact-frequency caps

Note: I am not a lawyer. SMS/voice outreach to purchased lists especially
should get a compliance sign-off before enabling those channels.

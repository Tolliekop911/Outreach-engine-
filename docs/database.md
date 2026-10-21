# Database

The engine runs on Supabase (Postgres). To stay within the free-tier project
limit, it shares the **Cowboy Mind** Supabase project but lives entirely in its
own isolated **`outreach`** schema. The Cowboy Mind `public` schema is never
touched. All app queries are schema-qualified to `outreach`.

Project ref: `vxenhdvnkeagpopkmetu` (region us-east-2)
URL: https://vxenhdvnkeagpopkmetu.supabase.co

## Tables (schema `outreach`)

| Table | Purpose |
| --- | --- |
| `lead_sources` | Where a batch of leads came from (e.g. APTA CSM 2027 list), cost, count. |
| `leads` | One row per lead: contact info, title/specialty/org, status, SMS/voice consent, free-form `custom` jsonb for extra list columns. |
| `audiences` | Named segments; optional stored `filter` for dynamic audiences. |
| `audience_members` | Lead-to-audience membership. |
| `campaigns` | A campaign targeting an audience, with a status. |
| `campaign_steps` | Ordered steps in a campaign: channel, delay, AI prompt, email subject. |
| `campaign_enrollments` | A lead's journey through a campaign: current step, next action time. |
| `messages` | Every outbound and inbound message across all channels, with status and provider id. |
| `message_events` | Opens, clicks, replies, deliveries, bounces, call outcomes. |
| `suppression` | Global opt-out / bounce / complaint / DNC list, per channel or all. |

RLS is enabled on every table (deny by default). The backend connects with the
service role key, which bypasses RLS; no anon/authenticated access is granted.

## Safety

- The purchased lead lists are PII and are never committed (see `.gitignore`).
- Every channel must check `suppression` before sending.
- The engine ships with `DRY_RUN=true` so it cannot send until explicitly enabled.

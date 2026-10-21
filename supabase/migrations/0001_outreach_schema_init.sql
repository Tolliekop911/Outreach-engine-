-- 0001 outreach schema init
-- Applied to the shared Cowboy Mind Supabase project (ref vxenhdvnkeagpopkmetu)
-- in an isolated `outreach` schema. Does not touch public.

create schema if not exists outreach;

-- ========= Enums =========
create type outreach.channel as enum ('email', 'sms', 'voice');
create type outreach.lead_status as enum ('new', 'active', 'engaged', 'converted', 'unqualified', 'suppressed');
create type outreach.campaign_status as enum ('draft', 'active', 'paused', 'completed', 'archived');
create type outreach.enrollment_status as enum ('active', 'completed', 'stopped', 'converted', 'suppressed');
create type outreach.message_direction as enum ('outbound', 'inbound');
create type outreach.message_status as enum ('queued', 'sent', 'delivered', 'bounced', 'failed', 'received');
create type outreach.suppression_reason as enum ('opt_out', 'bounce', 'complaint', 'manual', 'dnc');

-- ========= Lead sources =========
create table outreach.lead_sources (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  purchased_at date,
  cost_cents  integer,
  lead_count  integer default 0,
  created_at  timestamptz not null default now()
);

-- ========= Leads =========
create table outreach.leads (
  id            uuid primary key default gen_random_uuid(),
  source_id     uuid references outreach.lead_sources(id) on delete set null,
  email         text,
  phone         text,
  first_name    text,
  last_name     text,
  title         text,
  organization  text,
  specialty     text,
  city          text,
  state         text,
  country       text default 'US',
  status        outreach.lead_status not null default 'new',
  consent_sms   boolean not null default false,
  consent_voice boolean not null default false,
  custom        jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index leads_email_uidx on outreach.leads (lower(email)) where email is not null;
create index leads_phone_idx on outreach.leads (phone) where phone is not null;
create index leads_status_idx on outreach.leads (status);
create index leads_source_idx on outreach.leads (source_id);

-- ========= Audiences (segments) =========
create table outreach.audiences (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  filter      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create table outreach.audience_members (
  audience_id uuid not null references outreach.audiences(id) on delete cascade,
  lead_id     uuid not null references outreach.leads(id) on delete cascade,
  added_at    timestamptz not null default now(),
  primary key (audience_id, lead_id)
);

-- ========= Campaigns and their step sequences =========
create table outreach.campaigns (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  audience_id uuid references outreach.audiences(id) on delete set null,
  status      outreach.campaign_status not null default 'draft',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table outreach.campaign_steps (
  id             uuid primary key default gen_random_uuid(),
  campaign_id    uuid not null references outreach.campaigns(id) on delete cascade,
  step_order     integer not null,
  channel        outreach.channel not null,
  delay_minutes  integer not null default 0,
  prompt         text,
  subject        text,
  created_at     timestamptz not null default now(),
  unique (campaign_id, step_order)
);

create table outreach.campaign_enrollments (
  id            uuid primary key default gen_random_uuid(),
  campaign_id   uuid not null references outreach.campaigns(id) on delete cascade,
  lead_id       uuid not null references outreach.leads(id) on delete cascade,
  status        outreach.enrollment_status not null default 'active',
  current_step  integer not null default 0,
  next_action_at timestamptz,
  enrolled_at   timestamptz not null default now(),
  completed_at  timestamptz,
  unique (campaign_id, lead_id)
);
create index enrollments_due_idx on outreach.campaign_enrollments (next_action_at)
  where status = 'active';

-- ========= Messages =========
create table outreach.messages (
  id            uuid primary key default gen_random_uuid(),
  lead_id       uuid not null references outreach.leads(id) on delete cascade,
  campaign_id   uuid references outreach.campaigns(id) on delete set null,
  step_id       uuid references outreach.campaign_steps(id) on delete set null,
  channel       outreach.channel not null,
  direction     outreach.message_direction not null default 'outbound',
  status        outreach.message_status not null default 'queued',
  from_address  text,
  to_address    text,
  subject       text,
  body          text,
  provider_id   text,
  error         text,
  sent_at       timestamptz,
  created_at    timestamptz not null default now()
);
create index messages_lead_idx on outreach.messages (lead_id);
create index messages_campaign_idx on outreach.messages (campaign_id);
create index messages_status_idx on outreach.messages (status);

-- ========= Message events =========
create table outreach.message_events (
  id          uuid primary key default gen_random_uuid(),
  message_id  uuid references outreach.messages(id) on delete cascade,
  lead_id     uuid references outreach.leads(id) on delete cascade,
  event_type  text not null,
  detail      jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);
create index message_events_message_idx on outreach.message_events (message_id);
create index message_events_lead_idx on outreach.message_events (lead_id);
create index message_events_type_idx on outreach.message_events (event_type);

-- ========= Global suppression list =========
create table outreach.suppression (
  id            uuid primary key default gen_random_uuid(),
  email         text,
  phone         text,
  channel_scope text not null default 'all' check (channel_scope in ('email','sms','voice','all')),
  reason        outreach.suppression_reason not null,
  note          text,
  created_at    timestamptz not null default now()
);
create unique index suppression_email_uidx on outreach.suppression (lower(email), channel_scope) where email is not null;
create unique index suppression_phone_uidx on outreach.suppression (phone, channel_scope) where phone is not null;

-- ========= updated_at trigger =========
create or replace function outreach.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger leads_touch before update on outreach.leads
  for each row execute function outreach.touch_updated_at();
create trigger campaigns_touch before update on outreach.campaigns
  for each row execute function outreach.touch_updated_at();

-- ========= RLS: deny by default (service role bypasses) =========
alter table outreach.lead_sources enable row level security;
alter table outreach.leads enable row level security;
alter table outreach.audiences enable row level security;
alter table outreach.audience_members enable row level security;
alter table outreach.campaigns enable row level security;
alter table outreach.campaign_steps enable row level security;
alter table outreach.campaign_enrollments enable row level security;
alter table outreach.messages enable row level security;
alter table outreach.message_events enable row level security;
alter table outreach.suppression enable row level security;

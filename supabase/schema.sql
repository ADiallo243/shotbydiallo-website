create extension if not exists pgcrypto;

create type public.lead_stage as enum ('new','contacted','qualified','consultation','proposal','follow_up','booked','lost','future');
create type public.project_stage as enum ('brief','pre_production','scheduled','filming','editing','client_review','delivered','completed','archived');
create type public.project_service as enum ('music_video','business_video','monthly_content','other');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role text not null default 'owner' check (role in ('owner','manager','contractor')),
  created_at timestamptz not null default now()
);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id),
  name text not null,
  company text,
  email text,
  phone text,
  industry text,
  instagram text,
  notes text,
  created_at timestamptz not null default now()
);

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id),
  client_id uuid references public.clients(id) on delete set null,
  name text not null,
  company text,
  email text not null,
  phone text,
  service public.project_service not null,
  stage public.lead_stage not null default 'new',
  budget_range text,
  estimated_value numeric(12,2),
  project_date text,
  project_location text,
  brief text,
  reference_url text,
  source text,
  contact_preference text,
  next_action text,
  next_action_at timestamptz,
  lost_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id),
  client_id uuid not null references public.clients(id),
  lead_id uuid references public.leads(id) on delete set null,
  title text not null,
  service public.project_service not null,
  stage public.project_stage not null default 'brief',
  value numeric(12,2),
  shoot_at timestamptz,
  deadline_at timestamptz,
  location text,
  brief text,
  delivery_url text,
  preview_url text,
  contract_status text default 'not_sent',
  invoice_status text default 'not_sent',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id),
  lead_id uuid references public.leads(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  title text not null,
  category text,
  due_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.marketing_contacts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id),
  company text not null,
  contact_name text,
  email text,
  phone text,
  industry text,
  source text,
  status text not null default 'research',
  last_contacted_at timestamptz,
  next_follow_up_at timestamptz,
  notes text,
  created_at timestamptz not null default now()
);

create table public.activities (
  id bigint generated always as identity primary key,
  owner_id uuid not null references public.profiles(id),
  entity_type text not null,
  entity_id uuid,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  title text not null,
  message text not null,
  entity_type text,
  entity_id uuid,
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  email_requested_at timestamptz,
  email_sent_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.automation_rules (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  event_name text not null,
  action_name text not null,
  delay_minutes integer not null default 0 check (delay_minutes >= 0),
  enabled boolean not null default true,
  configuration jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  media_type text not null check (media_type in ('image','video')),
  storage_path text not null,
  website_placement text,
  alt_text text,
  created_at timestamptz not null default now()
);

create table public.contact_lists (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table public.contact_list_members (
  list_id uuid not null references public.contact_lists(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  subscribed boolean not null default true,
  subscribed_at timestamptz not null default now(),
  unsubscribed_at timestamptz,
  primary key (list_id, client_id)
);

create table public.referrals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  referrer_client_id uuid not null references public.clients(id),
  referred_lead_id uuid references public.leads(id),
  code text not null unique,
  reward_type text,
  reward_value numeric(12,2),
  status text not null default 'created',
  created_at timestamptz not null default now()
);

create table public.financial_entries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  invoice_number text,
  entry_type text not null check (entry_type in ('invoice','deposit','payment','refund','expense')),
  amount numeric(12,2) not null,
  status text not null,
  payment_method text,
  occurred_at timestamptz not null default now(),
  notes text,
  created_at timestamptz not null default now()
);

create table public.contracts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  client_id uuid not null references public.clients(id),
  project_id uuid references public.projects(id) on delete set null,
  title text not null,
  contract_html text not null,
  total_amount numeric(12,2) not null,
  deposit_percent numeric(5,2) not null default 25,
  service_date date,
  location text,
  delivery_delay text,
  revision_count integer not null default 2,
  status text not null default 'draft' check (status in ('draft','sent','viewed','signed','declined','cancelled')),
  sent_at timestamptz,
  signed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.receipts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  financial_entry_id uuid not null references public.financial_entries(id),
  receipt_number text not null unique,
  receipt_html text not null,
  issued_at timestamptz not null default now()
);

create table public.client_followups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  followup_type text not null check (followup_type in ('referral_thanks','review_request','relationship_checkin')),
  scheduled_for timestamptz not null,
  message_body text not null,
  referral_code text,
  status text not null default 'scheduled' check (status in ('scheduled','ready','sent','cancelled')),
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.clients enable row level security;
alter table public.leads enable row level security;
alter table public.projects enable row level security;
alter table public.tasks enable row level security;
alter table public.marketing_contacts enable row level security;
alter table public.activities enable row level security;
alter table public.notifications enable row level security;
alter table public.automation_rules enable row level security;
alter table public.media_assets enable row level security;
alter table public.contact_lists enable row level security;
alter table public.contact_list_members enable row level security;
alter table public.referrals enable row level security;
alter table public.financial_entries enable row level security;
alter table public.contracts enable row level security;
alter table public.receipts enable row level security;
alter table public.client_followups enable row level security;

create policy "Users manage own profile" on public.profiles for all to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "Users manage own clients" on public.clients for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "Users manage own leads" on public.leads for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "Users manage own projects" on public.projects for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "Users manage own tasks" on public.tasks for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "Users manage own prospects" on public.marketing_contacts for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "Users read own activity" on public.activities for select to authenticated using (owner_id = auth.uid());
create policy "Users manage own notifications" on public.notifications for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "Users manage own automation rules" on public.automation_rules for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "Users manage own media" on public.media_assets for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "Users manage own contact lists" on public.contact_lists for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "Users manage own list members" on public.contact_list_members for all to authenticated using (exists (select 1 from public.contact_lists where contact_lists.id = list_id and contact_lists.owner_id = auth.uid())) with check (exists (select 1 from public.contact_lists where contact_lists.id = list_id and contact_lists.owner_id = auth.uid()));
create policy "Users manage own referrals" on public.referrals for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "Users manage own financial entries" on public.financial_entries for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "Users manage own contracts" on public.contracts for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "Users manage own receipts" on public.receipts for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "Users manage own followups" on public.client_followups for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create index leads_owner_stage_idx on public.leads(owner_id, stage);
create index projects_owner_stage_idx on public.projects(owner_id, stage);
create index tasks_owner_due_idx on public.tasks(owner_id, due_at);
create index prospects_owner_followup_idx on public.marketing_contacts(owner_id, next_follow_up_at);
create index notifications_owner_unread_idx on public.notifications(owner_id, read_at, created_at desc);

-- Run in the Supabase SQL editor if you use hosted Supabase.
-- Local npm run dev uses data/globalx.json until these env vars are set.

create table if not exists users (
  id text primary key,
  referral_code text unique not null,
  sponsor_id text references users(id),
  is_demo boolean default false,
  display_name text,
  created_at timestamptz default now()
);

create table if not exists wallets (
  id text primary key,
  user_id text references users(id),
  address text not null,
  wallet_type text,
  chain_id int,
  verified boolean default false,
  created_at timestamptz default now(),
  unique (address, chain_id)
);

create table if not exists nonces (
  id text primary key,
  address text not null,
  nonce text unique not null,
  used boolean default false,
  expires_at timestamptz not null
);

create table if not exists referrals (
  id text primary key,
  user_id text references users(id),
  sponsor_id text references users(id),
  referral_code text
);

create table if not exists plans (
  id text primary key,
  code text unique,
  name text,
  amount_usd int,
  token text default 'USDT',
  network text default 'amoy',
  description text,
  active boolean default true,
  enabled boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists registrations (
  id text primary key,
  user_id text references users(id) unique,
  status text not null default 'NOT_PAID',
  amount text,
  tx_hash text,
  created_at timestamptz default now(),
  activated_at timestamptz
);

create table if not exists transactions (
  id text primary key,
  user_id text references users(id),
  payer_wallet text,
  recipient_wallet text,
  amount text,
  token text,
  token_contract text,
  chain_id int,
  tx_hash text unique,
  payment_type text,
  plan_id text references plans(id),
  plan_code text,
  status text,
  failure_reason text,
  created_at timestamptz default now()
);

create table if not exists network_positions (
  id text primary key,
  user_id text references users(id) unique,
  parent_id text,
  position text,
  depth int,
  cycle int
);

create table if not exists admin_users (
  id text primary key,
  username text unique,
  password_hash text
);

create table if not exists app_state (
  id text primary key,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);

insert into app_state (id, payload)
values ('globalx', '{}'::jsonb)
on conflict (id) do nothing;

alter table plans add column if not exists token text;
alter table plans add column if not exists network text;
alter table plans add column if not exists description text;
alter table plans add column if not exists active boolean default true;
alter table plans add column if not exists created_at timestamptz default now();
alter table plans add column if not exists updated_at timestamptz default now();
alter table transactions add column if not exists payment_type text;
alter table transactions add column if not exists plan_id text;

-- Browser anon key must not read these tables. Next.js uses SERVICE_ROLE (bypasses RLS).
alter table users enable row level security;
alter table wallets enable row level security;
alter table nonces enable row level security;
alter table referrals enable row level security;
alter table plans enable row level security;
alter table registrations enable row level security;
alter table transactions enable row level security;
alter table network_positions enable row level security;
alter table admin_users enable row level security;
alter table app_state enable row level security;



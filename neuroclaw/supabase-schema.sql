-- Run this in your Supabase SQL editor

create table if not exists agent_state (
  id int primary key default 1,
  born_at timestamptz not null default now(),
  total_memories int not null default 0,
  total_inputs int not null default 0,
  total_logs int not null default 0,
  last_thought_at timestamptz,
  constraint single_row check (id = 1)
);

insert into agent_state (id) values (1) on conflict do nothing;

create table if not exists logs (
  id bigint generated always as identity primary key,
  day int not null,
  title text not null,
  body text not null,
  mood text not null,
  memories_count int not null default 0,
  inputs_count int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists inputs (
  id bigint generated always as identity primary key,
  text text not null,
  created_at timestamptz not null default now()
);

create table if not exists memories (
  id bigint generated always as identity primary key,
  content text not null,
  source text not null default 'agent',
  created_at timestamptz not null default now()
);

create index if not exists idx_logs_created on logs (created_at desc);
create index if not exists idx_inputs_created on inputs (created_at desc);
create index if not exists idx_memories_created on memories (created_at desc);

-- RLS policies
alter table logs enable row level security;
alter table inputs enable row level security;
alter table memories enable row level security;
alter table agent_state enable row level security;

create policy "logs are public" on logs for select using (true);
create policy "inputs are public" on inputs for select using (true);
create policy "anyone can send input" on inputs for insert with check (true);
create policy "agent_state is public" on agent_state for select using (true);
create policy "memories are public" on memories for select using (true);

-- SoloClaw on-chain stats
create table if not exists agent_stats (
  id text primary key default 'default',
  total_claimed numeric default 0,
  total_bought_back numeric default 0,
  total_burned text default '0',
  last_run_at timestamptz,
  transactions jsonb default '[]',
  updated_at timestamptz default now()
);

insert into agent_stats (id) values ('default') on conflict do nothing;

alter table agent_stats enable row level security;
create policy "agent_stats are public" on agent_stats for select using (true);

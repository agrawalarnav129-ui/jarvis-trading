-- AXIOM Supabase schema — persistent storage for the React app.
-- Run in the Supabase SQL editor. RLS keeps each user's data private.

create table if not exists trades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) default auth.uid(),
  symbol text not null,
  side text default 'LONG',
  entry_price numeric,
  exit_price numeric,
  quantity integer,
  pnl numeric,
  setup_type text,
  planned_sl numeric,
  planned_target numeric,
  actual_rr numeric,
  session_type text,
  regime_at_entry text,
  discipline_score integer,
  notes text,
  created_at timestamptz default now()
);

create table if not exists watchlist (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) default auth.uid(),
  symbol text not null,
  grade text,
  score numeric,
  close numeric,
  notes text,
  added_at timestamptz default now()
);

create table if not exists settings (
  user_id uuid primary key references auth.users(id) default auth.uid(),
  capital numeric default 1000000,
  prefs jsonb default '{}'::jsonb,
  updated_at timestamptz default now()
);

-- Row Level Security
alter table trades enable row level security;
alter table watchlist enable row level security;
alter table settings enable row level security;

create policy "own trades"    on trades    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own watchlist" on watchlist for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own settings"  on settings  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

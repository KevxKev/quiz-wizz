-- Quiz Wizz MVP schema
-- Run this in the Supabase SQL Editor for your project.

create extension if not exists pgcrypto;

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  status text not null default 'lobby' check (status in ('lobby', 'playing', 'clip_playing', 'answering', 'revealed', 'leaderboard', 'finished')),
  current_round_id uuid null,
  current_round_number integer not null default 0,
  total_rounds integer not null default 5,
  phase_started_at timestamptz null,
  phase_ends_at timestamptz null,
  winner_name text null,
  created_at timestamptz not null default now()
);

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  nickname text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.room_players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  nickname text not null,
  is_host boolean not null default false,
  is_ready boolean not null default false,
  joined_at timestamptz not null default now(),
  unique (room_id, player_id)
);

create unique index if not exists room_players_room_nickname_unique
  on public.room_players (room_id, lower(nickname));

create table if not exists public.quiz_entries (
  id uuid primary key default gen_random_uuid(),
  title text null,
  artist text null,
  category text null,
  youtube_video_id text not null,
  clip_start_seconds integer not null default 0,
  clip_end_seconds integer not null default 15,
  playback_mode text not null default 'audio-video' check (playback_mode in ('audio-only', 'video-only', 'audio-video')),
  prompt_text text not null,
  answer_options jsonb not null default '[]'::jsonb,
  correct_answer text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists quiz_entries_active_created_at_idx
  on public.quiz_entries (is_active, created_at);

create table if not exists public.rounds (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  round_number integer not null,
  prompt_text text not null,
  answer_options jsonb not null default '[]'::jsonb,
  correct_answer text null,
  state text not null default 'clip_playing' check (state in ('queued', 'active', 'clip_playing', 'answering', 'revealed', 'leaderboard', 'closed')),
  created_at timestamptz not null default now(),
  unique (room_id, round_number)
);

create table if not exists public.answers (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  round_id uuid not null references public.rounds(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  answer_text text not null,
  created_at timestamptz not null default now(),
  unique (round_id, player_id)
);

alter table public.room_players add column if not exists is_ready boolean not null default false;

alter table public.rooms add column if not exists total_rounds integer not null default 5;
alter table public.rooms add column if not exists phase_started_at timestamptz null;
alter table public.rooms add column if not exists phase_ends_at timestamptz null;
alter table public.rooms add column if not exists winner_name text null;

alter table public.rounds add column if not exists quiz_entry_id uuid null references public.quiz_entries(id) on delete set null;
alter table public.rounds add column if not exists youtube_video_id text null;
alter table public.rounds add column if not exists clip_start_seconds integer not null default 0;
alter table public.rounds add column if not exists clip_end_seconds integer not null default 15;
alter table public.rounds add column if not exists playback_mode text not null default 'audio-video';
alter table public.rounds add column if not exists entry_title text null;
alter table public.rounds add column if not exists entry_artist text null;
alter table public.rounds add column if not exists entry_category text null;

alter table public.rooms drop constraint if exists rooms_status_check;
alter table public.rooms add constraint rooms_status_check
  check (status in ('lobby', 'playing', 'clip_playing', 'answering', 'revealed', 'leaderboard', 'worthy_playing', 'finished'));

alter table public.room_players add column if not exists worthy_vote boolean null default null;

-- Speed-score: milliseconds elapsed from clip_playing start to answer submission (client-side)
alter table public.answers add column if not exists answered_after_ms bigint null;

-- Creator attribution: who added this quiz entry (not shown in-game)
alter table public.quiz_entries add column if not exists creator text null;

alter table public.rounds drop constraint if exists rounds_state_check;
alter table public.rounds add constraint rounds_state_check
  check (state in ('queued', 'active', 'clip_playing', 'answering', 'revealed', 'leaderboard', 'closed'));

alter table public.rooms enable row level security;
alter table public.players enable row level security;
alter table public.room_players enable row level security;
alter table public.quiz_entries enable row level security;
alter table public.rounds enable row level security;
alter table public.answers enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'rooms' and policyname = 'rooms_open_access') then
    create policy rooms_open_access on public.rooms for all using (true) with check (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'players' and policyname = 'players_open_access') then
    create policy players_open_access on public.players for all using (true) with check (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'room_players' and policyname = 'room_players_open_access') then
    create policy room_players_open_access on public.room_players for all using (true) with check (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'quiz_entries' and policyname = 'quiz_entries_open_access') then
    create policy quiz_entries_open_access on public.quiz_entries for all using (true) with check (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'rounds' and policyname = 'rounds_open_access') then
    create policy rounds_open_access on public.rounds for all using (true) with check (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'answers' and policyname = 'answers_open_access') then
    create policy answers_open_access on public.answers for all using (true) with check (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'rooms'
  ) then
    alter publication supabase_realtime add table public.rooms;
  end if;

  if not exists (
    select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'room_players'
  ) then
    alter publication supabase_realtime add table public.room_players;
  end if;

  if not exists (
    select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'quiz_entries'
  ) then
    alter publication supabase_realtime add table public.quiz_entries;
  end if;

  if not exists (
    select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'rounds'
  ) then
    alter publication supabase_realtime add table public.rounds;
  end if;

  if not exists (
    select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'answers'
  ) then
    alter publication supabase_realtime add table public.answers;
  end if;
end $$;

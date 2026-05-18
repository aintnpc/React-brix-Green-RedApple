-- ============================================================
-- Red Apple (app.brix.redapple) — 006_init_consolidated.sql
-- 빈 DB에서 한 번에 실행
-- ============================================================


-- ──────────────────────────────────────────────────────────
-- 1. profiles
-- ──────────────────────────────────────────────────────────
create table if not exists profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  email           text,
  name            text,
  avatar_url      text,

  -- 신체 정보
  height          numeric(5,1),
  weight          numeric(5,1),
  age             smallint,
  gender          text check (gender in ('male', 'female')),

  -- 바디빌딩 목표
  build_goal          text check (build_goal in ('bulk', 'cut', 'maintain')),
  activity_level      text check (activity_level in ('sedentary', 'light', 'moderate', 'active', 'very_active')),
  experience_level    text check (experience_level in ('beginner', 'intermediate', 'advanced')),
  split_type          text check (split_type in ('full_body', 'upper_lower', 'push_pull_legs', 'bro_split')),
  focus_parts         jsonb,
  exercise_minutes_per_day  integer,

  -- 영양 목표 (단백질 중심)
  tdee                integer,
  daily_calorie_goal  integer,
  macro_carbs         integer,
  macro_protein       integer,
  macro_fat           integer,

  -- 프로그램
  program_started_at  timestamptz,
  has_completed_onboarding  boolean default false,

  -- 구독
  is_premium          boolean default false,
  plan_expires_at     timestamptz,

  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- 신규 유저 가입 시 profiles 행 자동 생성
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      new.raw_user_meta_data->>'nickname',
      split_part(coalesce(new.email, ''), '@', 1)
    ),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do update set
    email      = excluded.email,
    name       = coalesce(excluded.name, profiles.name),
    avatar_url = coalesce(excluded.avatar_url, profiles.avatar_url),
    updated_at = now();
  return new;
exception when others then
  raise warning 'handle_new_user error: %', sqlerrm;
  return new;
end;
$$;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at
  before update on profiles
  for each row execute procedure set_updated_at();


-- ──────────────────────────────────────────────────────────
-- 2. meal_logs
-- ──────────────────────────────────────────────────────────
create table if not exists meal_logs (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  date            date not null,
  meal_type       text not null check (meal_type in ('breakfast', 'lunch', 'dinner', 'snack')),
  foods           jsonb not null default '[]',
  total_calories  integer not null default 0,
  total_carbs     numeric(6,1) not null default 0,
  total_protein   numeric(6,1) not null default 0,
  total_fat       numeric(6,1) not null default 0,
  input_text      text,
  image_url       text,
  created_at      timestamptz default now()
);

create index meal_logs_user_date on meal_logs(user_id, date);


-- ──────────────────────────────────────────────────────────
-- 3. exercise_logs (웨이트 트레이닝 세트 기록 포함)
-- ──────────────────────────────────────────────────────────
create table if not exists exercise_logs (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  date              date not null,
  exercise          jsonb not null,
  sets              jsonb,
  duration_minutes  integer,
  calories_burned   integer,
  created_at        timestamptz default now()
);

create index exercise_logs_user_date on exercise_logs(user_id, date);


-- ──────────────────────────────────────────────────────────
-- 4. weight_logs
-- ──────────────────────────────────────────────────────────
create table if not exists weight_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  date        date not null,
  weight      numeric(5,1) not null,
  created_at  timestamptz default now(),
  unique (user_id, date)
);

create index weight_logs_user_date on weight_logs(user_id, date);


-- ──────────────────────────────────────────────────────────
-- 5. feedbacks
-- ──────────────────────────────────────────────────────────
create table if not exists feedbacks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  content     text not null,
  created_at  timestamptz default now()
);


-- ──────────────────────────────────────────────────────────
-- 6. RLS
-- ──────────────────────────────────────────────────────────
alter table profiles      enable row level security;
alter table meal_logs     enable row level security;
alter table exercise_logs enable row level security;
alter table weight_logs   enable row level security;
alter table feedbacks     enable row level security;

-- profiles
create policy "본인 프로필 조회" on profiles
  for select using (auth.uid() = id);

create policy "본인 프로필 수정" on profiles
  for update using (auth.uid() = id);

-- meal_logs
create policy "본인 식단 조회" on meal_logs
  for select using (auth.uid() = user_id);

create policy "본인 식단 추가" on meal_logs
  for insert with check (auth.uid() = user_id);

create policy "본인 식단 삭제" on meal_logs
  for delete using (auth.uid() = user_id);

-- exercise_logs
create policy "본인 운동 조회" on exercise_logs
  for select using (auth.uid() = user_id);

create policy "본인 운동 추가" on exercise_logs
  for insert with check (auth.uid() = user_id);

create policy "본인 운동 삭제" on exercise_logs
  for delete using (auth.uid() = user_id);

-- weight_logs
create policy "본인 체중 조회" on weight_logs
  for select using (auth.uid() = user_id);

create policy "본인 체중 추가" on weight_logs
  for insert with check (auth.uid() = user_id);

create policy "본인 체중 수정" on weight_logs
  for update using (auth.uid() = user_id);

create policy "본인 체중 삭제" on weight_logs
  for delete using (auth.uid() = user_id);

-- feedbacks
create policy "본인 피드백 조회" on feedbacks
  for select using (auth.uid() = user_id);

create policy "본인 피드백 추가" on feedbacks
  for insert with check (auth.uid() = user_id);

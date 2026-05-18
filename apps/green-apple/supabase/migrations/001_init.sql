-- ============================================================
-- re:fine — 초기 스키마
-- Supabase SQL Editor에 붙여넣고 실행
-- ============================================================

-- ──────────────────────────────────────────────────────────
-- 1. profiles
--    auth.users와 1:1. 신체정보 + 목표 + 온보딩 상태
-- ──────────────────────────────────────────────────────────
create table if not exists profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  email           text,
  name            text,
  avatar_url      text,

  -- 신체 정보
  height          numeric(5,1),           -- cm
  weight          numeric(5,1),           -- kg
  age             smallint,
  gender          text check (gender in ('male', 'female')),

  -- 목표
  goal            text check (goal in ('lose_weight', 'maintain', 'gain_muscle')),
  activity_level  text check (activity_level in ('sedentary', 'light', 'moderate', 'active', 'very_active')),
  target_weight   numeric(5,1),           -- kg
  target_days     smallint,               -- 목표 기간 (일)

  -- 계산된 목표값 (온보딩 완료 시 저장)
  tdee            integer,
  daily_calorie_goal  integer,
  macro_carbs     integer,                -- g
  macro_protein   integer,                -- g
  macro_fat       integer,                -- g

  has_completed_onboarding  boolean default false,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- 신규 유저 가입 시 profiles 행 자동 생성
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into profiles (id, email, name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', new.email),
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- updated_at 자동 갱신
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
--    하루 식사 기록. foods는 FoodItem[] JSON 배열.
-- ──────────────────────────────────────────────────────────
create table if not exists meal_logs (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  date            date not null,
  meal_type       text not null check (meal_type in ('breakfast', 'lunch', 'dinner', 'snack')),

  -- Claude Vision 분석 결과 (FoodItem[])
  foods           jsonb not null default '[]',

  -- 합산 영양 정보
  total_calories  integer not null default 0,
  total_carbs     numeric(6,1) not null default 0,
  total_protein   numeric(6,1) not null default 0,
  total_fat       numeric(6,1) not null default 0,

  input_text      text,                   -- 텍스트 입력 원문
  image_url       text,                   -- 사진 URL (Storage)

  created_at      timestamptz default now()
);

create index meal_logs_user_date on meal_logs(user_id, date);


-- ──────────────────────────────────────────────────────────
-- 3. exercise_logs
--    유산소 중심. exercise 메타데이터는 jsonb로 그대로 저장.
-- ──────────────────────────────────────────────────────────
create table if not exists exercise_logs (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  date              date not null,

  -- Exercise 객체 전체 (type, label 등)
  exercise          jsonb not null,

  duration_minutes  integer,
  calories_burned   integer,

  created_at        timestamptz default now()
);

create index exercise_logs_user_date on exercise_logs(user_id, date);


-- ──────────────────────────────────────────────────────────
-- 4. RLS (Row Level Security)
--    본인 데이터만 읽기/쓰기 가능
-- ──────────────────────────────────────────────────────────
alter table profiles       enable row level security;
alter table meal_logs      enable row level security;
alter table exercise_logs  enable row level security;

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

-- profiles에 바디빌딩 전용 필드 추가
alter table profiles
  add column if not exists experience_level  text check (experience_level in ('beginner', 'intermediate', 'advanced')),
  add column if not exists split_type        text check (split_type in ('full_body', 'upper_lower', 'push_pull_legs', 'bro_split')),
  add column if not exists build_goal        text check (build_goal in ('bulk', 'cut', 'maintain')),
  add column if not exists focus_parts       jsonb,
  add column if not exists exercise_minutes_per_day  integer,
  add column if not exists program_started_at        timestamptz;

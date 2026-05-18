-- exercise_logs에 sets 컬럼 추가 (웨이트 트레이닝 세트 기록)
alter table exercise_logs add column if not exists sets jsonb;

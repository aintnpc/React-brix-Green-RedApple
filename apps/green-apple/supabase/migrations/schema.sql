-- Green Apple — 전체 스키마 (실행용)
-- 새 Supabase 프로젝트 SQL Editor에 붙여넣고 실행

-- ──────────────────────────────────────────────────────────
-- 1. profiles
-- ──────────────────────────────────────────────────────────
CREATE TABLE public.profiles (
  id uuid NOT NULL,
  email text,
  name text,
  avatar_url text,
  height numeric,
  weight numeric,
  age smallint,
  gender text CHECK (gender = ANY (ARRAY['male'::text, 'female'::text])),
  goal text CHECK (goal = ANY (ARRAY['lose_weight'::text, 'maintain'::text, 'gain_muscle'::text])),
  activity_level text CHECK (activity_level = ANY (ARRAY['sedentary'::text, 'light'::text, 'moderate'::text, 'active'::text, 'very_active'::text])),
  target_weight numeric,
  target_days smallint,
  tdee integer,
  daily_calorie_goal integer,
  macro_carbs integer,
  macro_protein integer,
  macro_fat integer,
  has_completed_onboarding boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  is_premium boolean NOT NULL DEFAULT false,
  selected_plan text CHECK (selected_plan = ANY (ARRAY['1week'::text, '2week'::text, '2week_x3'::text])),
  program_started_at timestamp with time zone,
  exercise_minutes_per_day integer DEFAULT 30,
  plan_expires_at timestamp with time zone,
  remaining_sessions integer,
  CONSTRAINT profiles_pkey PRIMARY KEY (id),
  CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE
);

-- 신규 유저 가입 시 profiles 행 자동 생성
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, avatar_url)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', new.email),
    new.raw_user_meta_data->>'avatar_url'
  );
  RETURN new;
END;
$$;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE handle_new_user();

-- updated_at 자동 갱신
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  new.updated_at = now();
  RETURN new;
END;
$$;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();


-- ──────────────────────────────────────────────────────────
-- 2. meal_logs
-- ──────────────────────────────────────────────────────────
CREATE TABLE public.meal_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  date date NOT NULL,
  meal_type text NOT NULL CHECK (meal_type = ANY (ARRAY['breakfast'::text, 'lunch'::text, 'dinner'::text, 'snack'::text])),
  foods jsonb NOT NULL DEFAULT '[]'::jsonb,
  total_calories integer NOT NULL DEFAULT 0,
  total_carbs numeric NOT NULL DEFAULT 0,
  total_protein numeric NOT NULL DEFAULT 0,
  total_fat numeric NOT NULL DEFAULT 0,
  input_text text,
  image_url text,
  created_at timestamp with time zone DEFAULT now(),
  total_nutrition jsonb,
  CONSTRAINT meal_logs_pkey PRIMARY KEY (id),
  CONSTRAINT meal_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

CREATE INDEX meal_logs_user_date ON public.meal_logs(user_id, date);


-- ──────────────────────────────────────────────────────────
-- 3. exercise_logs
-- ──────────────────────────────────────────────────────────
CREATE TABLE public.exercise_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  date date NOT NULL,
  exercise jsonb NOT NULL,
  duration_minutes integer,
  calories_burned integer,
  created_at timestamp with time zone DEFAULT now(),
  amount numeric,
  route jsonb,
  CONSTRAINT exercise_logs_pkey PRIMARY KEY (id),
  CONSTRAINT exercise_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

CREATE INDEX exercise_logs_user_date ON public.exercise_logs(user_id, date);


-- ──────────────────────────────────────────────────────────
-- 4. weight_logs
-- ──────────────────────────────────────────────────────────
CREATE TABLE public.weight_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  date date NOT NULL,
  weight numeric NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT weight_logs_pkey PRIMARY KEY (id),
  CONSTRAINT weight_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT weight_logs_user_date_unique UNIQUE (user_id, date)
);


-- ──────────────────────────────────────────────────────────
-- 5. feedbacks
-- ──────────────────────────────────────────────────────────
CREATE TABLE public.feedbacks (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  content text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT feedbacks_pkey PRIMARY KEY (id),
  CONSTRAINT feedbacks_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL
);


-- ──────────────────────────────────────────────────────────
-- 6. promo_codes + promo_code_uses
-- ──────────────────────────────────────────────────────────
CREATE TABLE public.promo_codes (
  code text NOT NULL,
  plan_type text NOT NULL CHECK (plan_type = ANY (ARRAY['1week'::text, '2week'::text, '2week_x3'::text])),
  max_uses integer NOT NULL DEFAULT 1,
  used_count integer NOT NULL DEFAULT 0,
  expires_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT promo_codes_pkey PRIMARY KEY (code)
);

CREATE TABLE public.promo_code_uses (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  code text NOT NULL,
  user_id uuid NOT NULL,
  used_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT promo_code_uses_pkey PRIMARY KEY (id),
  CONSTRAINT promo_code_uses_code_fkey FOREIGN KEY (code) REFERENCES public.promo_codes(code),
  CONSTRAINT promo_code_uses_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);


-- ──────────────────────────────────────────────────────────
-- 7. RLS
-- ──────────────────────────────────────────────────────────
ALTER TABLE public.profiles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meal_logs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercise_logs   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weight_logs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedbacks       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promo_codes     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promo_code_uses ENABLE ROW LEVEL SECURITY;

-- profiles
CREATE POLICY "본인 프로필 조회" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "본인 프로필 수정" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- meal_logs
CREATE POLICY "본인 식단 조회" ON public.meal_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "본인 식단 추가" ON public.meal_logs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "본인 식단 수정" ON public.meal_logs FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "본인 식단 삭제" ON public.meal_logs FOR DELETE USING (auth.uid() = user_id);

-- exercise_logs
CREATE POLICY "본인 운동 조회" ON public.exercise_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "본인 운동 추가" ON public.exercise_logs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "본인 운동 삭제" ON public.exercise_logs FOR DELETE USING (auth.uid() = user_id);

-- weight_logs
CREATE POLICY "본인 체중 조회" ON public.weight_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "본인 체중 추가" ON public.weight_logs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "본인 체중 수정" ON public.weight_logs FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "본인 체중 삭제" ON public.weight_logs FOR DELETE USING (auth.uid() = user_id);

-- feedbacks
CREATE POLICY "본인 피드백 추가" ON public.feedbacks FOR INSERT WITH CHECK (auth.uid() = user_id);

-- promo_codes (누구나 조회 가능 — 앱에서 코드 검증 시 필요)
CREATE POLICY "프로모 코드 조회" ON public.promo_codes FOR SELECT USING (true);

-- promo_code_uses
CREATE POLICY "본인 프로모 사용 조회" ON public.promo_code_uses FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "본인 프로모 사용 추가" ON public.promo_code_uses FOR INSERT WITH CHECK (auth.uid() = user_id);

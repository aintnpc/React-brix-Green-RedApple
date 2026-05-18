-- promo_codes: 발급된 프로모 코드 관리
CREATE TABLE promo_codes (
  code          TEXT PRIMARY KEY,
  plan_type     TEXT NOT NULL CHECK (plan_type IN ('1week', '2week', '2week_x3')),
  max_uses      INT  NOT NULL DEFAULT 1,
  used_count    INT  NOT NULL DEFAULT 0,
  expires_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- promo_code_uses: 코드 사용 이력 (중복 사용 방지)
CREATE TABLE promo_code_uses (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  code       TEXT        NOT NULL REFERENCES promo_codes(code),
  user_id    UUID        NOT NULL REFERENCES auth.users(id),
  used_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (code, user_id)  -- 같은 유저가 같은 코드 두 번 사용 불가
);

-- RLS: 유저는 자기 사용 이력만 조회 가능, 코드 테이블은 읽기 전용
ALTER TABLE promo_codes     ENABLE ROW LEVEL SECURITY;
ALTER TABLE promo_code_uses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read promo_codes"
  ON promo_codes FOR SELECT USING (true);

CREATE POLICY "Users can read own uses"
  ON promo_code_uses FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own uses"
  ON promo_code_uses FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 코드 사용 처리 함수 (atomic: 검증 + used_count 증가 + 이력 기록)
CREATE OR REPLACE FUNCTION redeem_promo_code(p_code TEXT, p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_code   promo_codes%ROWTYPE;
  v_result JSONB;
BEGIN
  -- 코드 존재 여부 + 행 잠금
  SELECT * INTO v_code FROM promo_codes WHERE code = UPPER(p_code) FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_code');
  END IF;

  -- 만료 확인
  IF v_code.expires_at IS NOT NULL AND v_code.expires_at < NOW() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'expired');
  END IF;

  -- 사용 횟수 초과 확인
  IF v_code.used_count >= v_code.max_uses THEN
    RETURN jsonb_build_object('ok', false, 'error', 'exhausted');
  END IF;

  -- 중복 사용 확인
  IF EXISTS (SELECT 1 FROM promo_code_uses WHERE code = UPPER(p_code) AND user_id = p_user_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_used');
  END IF;

  -- 사용 처리
  UPDATE promo_codes SET used_count = used_count + 1 WHERE code = UPPER(p_code);
  INSERT INTO promo_code_uses (code, user_id) VALUES (UPPER(p_code), p_user_id);

  RETURN jsonb_build_object('ok', true, 'plan_type', v_code.plan_type);
END;
$$;

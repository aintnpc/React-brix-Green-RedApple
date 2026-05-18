Red Apple 구현 계획
Green Apple 구조와 1:1 대응
Green Apple	Red Apple
목표: -4kg / 2주	목표: +근육 / 12주 (bulk/cut)
코치 로직: 칼로리 적자 역산	코치 로직: 칼로리 잉여 + 단백질 목표
오늘 처방: 운동 N분	오늘 처방: 오늘 부위 + 세트 수
식단 탭: 칼로리 위주	식단 탭: 단백질/탄수화물 위주
운동 탭: 러닝/줄넘기 시간 기록	운동 탭: 세트/무게/횟수 기록
기록 탭: 체중 그래프	기록 탭: 체중 + 측정 부위 (팔/가슴/허리)
Phase 1 — 인프라 (빌드 확인 후)
Supabase 신규 프로젝트 — .env 교체, DB 테이블 설계
RevenueCat 신규 앱 — lib/iap.ts stub 교체
shared/types에 BuildBodyInfo 타입 추가 — planBodybuilding.ts에서 이미 정의했으니 types/ 로 이동
Phase 2 — 온보딩 교체
Green Apple 9단계 → Red Apple 8단계

단계	Green Apple	Red Apple
0	닉네임	닉네임
1	성별	성별
2	키	키
3	활동량	활동량
4	현재체중 + 목표체중	현재체중 + 목표체중(선택)
5	운동 가능 시간	운동 경력 (초급/중급/고급)
6	플랜 요약 (BMR/TDEE)	분할 방식 (full body/상하체/PPL/분할) + 목표 (bulk/cut/maintain)
7	플랜 요약	플랜 요약 (단백질 목표/칼로리/주간 볼륨)
8	알림	알림
Phase 3 — 홈 화면 교체
Green Apple의 AppleGauge(칼로리 링) 구조를 그대로 유지하되 수치만 교체

Green Apple 홈	Red Apple 홈
링: 칼로리 섭취 / 운동 소모 / 스트릭	링: 단백질 달성 / 볼륨 달성 / 스트릭
오늘 처방 카드: "러닝 42분"	오늘 처방 카드: 오늘 운동 부위 + 인체 맵 미리보기
식단 카드: 칼로리 진행률	식단 카드: 단백질 진행률
코치 메시지: 칼로리 기반	코치 메시지: 단백질/볼륨 기반
Phase 4 — 운동 탭 교체 (코어)

인체 맵 탭 (기존 gym-app 자산 활용)
  → 근육 터치
  → 해당 근육 운동 목록 (바텀시트)
  → 운동 선택
  → 세트 기록 (무게 × 횟수, Green Apple exercise-tracker 패턴 참고)
  → 완료 시 홈 볼륨 링 업데이트
exerciseLog store 교체:

Green Apple: duration_minutes, calories_burned
Red Apple: sets, reps, weight_kg, muscle_group
Phase 5 — 식단 탭
Green Apple 식단 탭 거의 그대로 유지. 변경점:

상단 수치: 칼로리 → 단백질(g) 메인, 칼로리는 서브
매크로 바: 탄단지 비율 바디빌딩 기준 (단백질 강조)
AI 분석 (lib/claude.ts): Green Apple 것 그대로 재사용 가능
Phase 6 — 기록 탭
체중 그래프: 그대로 유지
신체 측정 추가: 팔둘레 / 가슴 / 허리 / 허벅지 — 근육 성장 추적
작업 순서 제안

1. 빌드 확인 (지금 당장)
2. Supabase + RevenueCat 신규 설정
3. Phase 2: 온보딩 교체
4. Phase 3: 홈 화면 교체
5. Phase 4: 운동 탭 (인체 맵 연결) ← 코어
6. Phase 5: 식단 탭 미세 조정
7. Phase 6: 기록 탭 신체 측정 추가
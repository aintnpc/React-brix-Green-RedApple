# re:fine — Claude Code Design Guide

> 이 문서는 Claude Code가 re:fine 앱의 모든 화면을 구현할 때 따라야 할 디자인 시스템 + 인터랙션 규격이다.
> 모든 컴포넌트는 이 가이드를 기준으로 구현한다. 가이드에 없는 케이스는 "애플 헬스 앱"을 레퍼런스로 판단한다.

---

## 1. 브랜드 아이덴티티

| 항목 | 값 |
|---|---|
| 앱 이름 | **re:fine** |
| 캐치프레이즈 | **4kg in 2 weeks** |
| 포지셔닝 | 다이어트 코치의 프로그램화 |
| 톤 | 깔끔하고 과학적, 그러나 따뜻함. 엄격하지 않고 "할 수 있어" 에너지. |

---

## 2. 컬러 시스템

```ts
// packages/theme/src/colors.ts 에 반영할 것
export const colors = {
  // Brand
  mint:    '#3ECFB2',   // 메인 브랜드 컬러 (CTA, 로고, 강조)
  mintLight: '#E8FAF6', // 민트 배경 틴트

  // Activity Rings (Apple Health 스타일)
  ringCalorie:  '#FF6B6B', // 빨강 — 칼로리/식단 링
  ringExercise: '#30D158', // 초록 — 운동 링
  ringStreak:   '#5E5CE6', // 보라 — 스트릭/연속 링

  // Neutral
  background:   '#FFFFFF',
  surface:      '#F5F5F7', // Apple style light gray
  surfaceCard:  '#FFFFFF',
  border:       '#E5E5EA',

  // Text
  textPrimary:   '#1C1C1E', // Apple near-black
  textSecondary: '#636366',
  textTertiary:  '#AEAEB2',
  textInverse:   '#FFFFFF',

  // Status
  success: '#30D158',
  error:   '#FF3B30',
  warning: '#FF9500',
}
```

**컬러 사용 원칙:**
- 앱의 기본 팔레트는 **Apple 뉴트럴** — 흰 카드, `#F5F5F7` 배경, `#1C1C1E` 텍스트.
- 민트(`#3ECFB2`)는 **딱 3곳에만** 사용: ① 메인 CTA 버튼 fill ② re:fine 로고 ③ `re:fined ✓` 완료 모달 배경. 그 외 전부 금지.
- 링 3색(빨강/초록/보라)은 ActivityRings 카드에만 등장. 다른 UI 요소에 재사용 금지.
- 카드 배경은 순백(`#FFFFFF`), 앱 배경은 `#F5F5F7` (iOS Settings 느낌).
- 텍스트는 `#1C1C1E` (애플 표준). 절대 순수 black(`#000`) 쓰지 않는다.
- 강조가 필요한 숫자/텍스트는 민트 대신 **Bold + 크기 업** 처리로 해결한다.

---

## 3. 타이포그래피

**폰트:** SF Pro (iOS 기본) — `System` 폰트 사용으로 자동 적용됨.

| 용도 | 크기 | 굵기 | 비고 |
|---|---|---|---|
| 대형 숫자 (링 중앙) | 36–48px | Bold 700 | 오늘 남은 칼로리 등 |
| 화면 제목 | 28px | Bold 700 | |
| 섹션 헤더 | 17px | Semibold 600 | |
| 본문 | 15px | Regular 400 | |
| 캡션/레이블 | 13px | Regular 400 | |
| 마이크로 | 11px | Regular 400 | 단위, 날짜 등 |

**원칙:**
- 숫자는 항상 Bold. 사람은 숫자에서 진도를 확인한다.
- 캐치프레이즈 `4kg in 2 weeks`는 italic + Bold 조합 가능.

---

## 4. 스페이싱 & 레이아웃

```
기본 그리드: 16px
카드 패딩:   20px
섹션 간격:   24px
카드 radius: 16px (애플 설정 앱 수준)
탭바 높이:   83px (iOS SafeArea 포함)
```

**카드 스타일:**
```ts
{
  backgroundColor: '#FFFFFF',
  borderRadius: 16,
  padding: 20,
  // shadow (iOS)
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.06,
  shadowRadius: 8,
  // shadow (Android)
  elevation: 2,
}
```

---

## 5. 애니메이션 — Staggered Entrance Effect

> **모든 화면 진입 시 Staggered 애니메이션 필수.** 화면의 각 카드/섹션이 아래에서 위로 순서대로 fade+slide-in.

### 5-1. 기본 패턴 (react-native-reanimated 사용)

```ts
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated'

// 각 요소마다 index를 기반으로 delay 부여
const STAGGER_DELAY = 80 // ms per item

function useStaggeredEntrance(index: number) {
  const opacity = useSharedValue(0)
  const translateY = useSharedValue(20)

  useEffect(() => {
    const delay = index * STAGGER_DELAY
    opacity.value = withDelay(delay, withTiming(1, { duration: 400, easing: Easing.out(Easing.quad) }))
    translateY.value = withDelay(delay, withTiming(0, { duration: 400, easing: Easing.out(Easing.quad) }))
  }, [])

  return useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }))
}
```

### 5-2. 화면별 Stagger 순서

**홈 화면:**
1. 인사말 + 날짜 헤더 (index 0)
2. 링 카드 — 3개 링 (index 1)
3. "오늘 해야 할 운동" 처방 카드 (index 2)
4. 식단 요약 카드 (index 3)
5. 추천 운동 리스트 아이템들 (index 4, 5)

**온보딩 각 단계:**
- 타이틀 → 설명 텍스트 → 입력 필드 → 버튼 순으로 stagger

**운동/식단 탭:**
- 헤더 → 오늘 요약 카드 → 리스트 아이템들 순으로 stagger

### 5-3. 링 애니메이션

링(원형 프로그레스)은 화면 진입 시 0%에서 실제 값까지 arc가 채워지는 애니메이션:
- duration: 800ms
- easing: `Easing.out(Easing.cubic)`
- 3개 링이 동시에 시작하되, 각각 50ms offset

### 5-4. 버튼 인터랙션

CTA 버튼 press 시:
```ts
// scale down on press, spring back on release
scale.value = withTiming(0.96, { duration: 100 })
// on release:
scale.value = withSpring(1, { damping: 15, stiffness: 300 })
```

---

## 6. 핵심 컴포넌트 스펙

### 6-1. ActivityRings (홈 화면 중심)

Apple Watch Activity Ring 스타일. 3개의 동심원 링.

```
외부 링 (빨강 #FF6B6B): 칼로리 — 오늘 섭취 vs 목표
중간 링 (초록 #30D158): 운동 — 오늘 소모 vs 필요량
내부 링 (보라 #5E5CE6): 스트릭 — 연속 달성일
```

링 중앙: 남은 운동량 kcal을 Bold 36px로 표시.
링 아래: `"오늘 XX kcal 더 태우면 목표 달성"` 캡션.

### 6-2. ExercisePrescriptionCard (핵심 차별화 UI)

오늘 해야 할 운동을 "처방전" 느낌으로 표시.

```
┌─────────────────────────────────┐
│ 💪 오늘의 처방                   │
│                                  │
│  걷기          42분              │
│  줄넘기        23분              │
│                                  │
│  소모 예상: 428 kcal             │
│                                  │
│  [운동 시작하기 →]               │
└─────────────────────────────────┘
```

- 배경: 흰 카드
- "처방" 헤더: `#1C1C1E` semibold — 민트 쓰지 않음
- 운동 이름: `#1C1C1E` semibold, 운동 시간: `#1C1C1E` Bold (크기로 강조, 색상 아님)
- CTA 버튼만: mint 배경, 흰 텍스트 (화면당 민트 노출은 이 버튼 하나)

### 6-3. MealPhotoCard (식단 입력)

Cal AI 스타일. 카메라 버튼이 중심.

```
┌─────────────────────────────────┐
│  📷  오늘 먹은 것 찍기           │
│      AI가 칼로리를 계산해요      │
│                                  │
│   [  사진 찍기  ] [ 앨범 ]       │
└─────────────────────────────────┘
```

사진 업로드 후: 분석 중 skeleton loader → 결과 표시.

### 6-4. re:fined 완료 배지 (바이럴 핵심)

하루 목표 달성 시 전체화면 모달:

```
배경: 민트 그라디언트 (#3ECFB2 → #2BB5A0)
중앙: "re:fined ✓" — 흰색 bold 48px italic
서브: "오늘 428 kcal 소모했어요"
      "D-9 목표까지"
버튼1: [share my result →] — 흰 배경, 민트 텍스트
버튼2: [닫기] — 투명
```

공유 이미지에는 re:fine 로고 + 결과 수치 포함.

### 6-5. PaywallScreen

온보딩 완료 후 나타나는 페이월.

```
상단: "3일 무료 체험 시작"
      "4kg in 2 weeks — 당신의 코치"

플랜 선택 (카드 3개 horizontal):
  ┌──────┐  ┌──────────┐  ┌──────┐
  │2주   │  │3개월 ★  │  │평생  │
  │₩4,900│  │₩9,900   │  │₩39,900│
  └──────┘  └──────────┘  └──────┘
            가장 인기 배지

[3일 무료로 시작하기]
"언제든 취소 가능 · 자동 갱신"
```

---

## 7. 화면별 디자인 지시

### 7-1. 홈 탭 (`(tabs)/index.tsx`)

**레이아웃 순서 (위→아래):**
1. 상단 바: re:fine 로고(좌) + 프로필 아이콘(우)
2. 인사 텍스트: `"안녕하세요, [이름]님"` — 17px semibold
   날짜: `"4월 20일 일요일 · D-5"` — 13px tertiary
3. **ActivityRings 카드** — 화면의 40% 높이, 중심 시각 요소
4. **ExercisePrescriptionCard** — 오늘 처방
5. 식단 요약 카드 (오늘 먹은 것 간략 표시)

### 7-2. 식단 탭 (`(tabs)/diet.tsx`)

1. 헤더: "오늘 식단" + 총 칼로리
2. MealPhotoCard — 사진 촬영 유도
3. 기록된 식사 리스트 (시간순)
4. 탄단지 그래프 바 (3색)

### 7-3. 운동 탭 (`(tabs)/exercise.tsx`)

1. 헤더: 오늘 소모 kcal + 필요 kcal
2. 운동 처방 카드 (전체 5종 표시)
3. 운동 기록 시작 버튼 → 타이머 화면
4. 오늘 완료한 운동 리스트

### 7-4. 온보딩 (`onboarding/index.tsx`)

각 단계마다:
- 상단: 단계 인디케이터 (5개 점, 현재 단계 민트)
- 큰 제목 (Bold 28px)
- 설명 텍스트 (15px secondary)
- 입력 UI (슬라이더/선택 카드/피커)
- 하단 고정: CTA 버튼 (`다음 →`)

**5단계 플랜 확인 화면:**
- "나의 플랜" 제목
- BMR, TDEE 숫자를 크게 표시
- 탄단지 비율 시각화 (파이차트 또는 바)
- "시작하기" → 페이월로 이동

---

## 8. Recursive Daily Sequence (매일 반복되는 UX 루프)

> 이 루프가 re:fine의 Lock-in 핵심. 매일 앱을 열고 싶게 만드는 설계.

```
앱 실행
  └── 홈 stagger 애니메이션으로 오늘 상황 한눈에
        └── 링이 0% → 채워지는 애니메이션 (나 오늘 아직 못했구나)
              └── "오늘 처방: 걷기 42분" 카드 클릭
                    └── 식단 먼저 찍기 → AI 분석 → 운동량 재계산
                          └── 운동 시작 → 타이머
                                └── 완료 → "re:fined ✓" 모달
                                      └── [share my result] → 바이럴
```

**이 루프를 끊지 않는 것이 최우선.** 페이지 전환은 모두 부드러운 slide/fade. 로딩 시 절대 흰 화면 노출 없이 skeleton 사용.

---

## 9. 금지 사항

- ❌ `#000000` 순수 블랙 텍스트 — `#1C1C1E` 사용
- ❌ 2개 이상 accent 색을 한 화면에 섞기 (링 3색 카드는 예외)
- ❌ 애니메이션 없는 화면 전환
- ❌ 스켈레톤 없는 로딩 상태
- ❌ 폰트 사이즈 5종 이상 한 화면에 사용
- ❌ 카드 없이 바로 배경에 요소 올리기 (반드시 카드 위에)
- ❌ CTA 버튼 / 로고 / re:fined 완료 모달 이외에 민트 컬러 사용
- ❌ 숫자 강조에 민트 사용 — Bold + 크기로 해결할 것
- ❌ 링 3색을 ActivityRings 외부에서 재사용

---

## 10. 구현 우선순위 (3일 플랜)

### Day 1 — 디자인 시스템 + 홈/온보딩

- [ ] `packages/theme/src/colors.ts` — re:fine 컬러로 전면 교체
- [ ] `ActivityRings` 컴포넌트 신규 구현 (stagger + ring fill 애니메이션)
- [ ] `ExercisePrescriptionCard` 컴포넌트 구현
- [ ] 홈 화면 전면 재설계 (stagger entrance)
- [ ] 온보딩 UI polish (stagger + 단계 인디케이터)

### Day 2 — AI 식단 분석 + 운동 확장

- [ ] Claude Vision API 연동 (`(tabs)/diet.tsx`) — 사진 → 칼로리 분석
- [ ] 운동 종류 확장: 걷기/줄넘기/필라테스/요가/홈트 추가
- [ ] `packages/shared/utils/plan.ts` — 새 운동 MET 계수 추가
- [ ] 식단 탭 MealPhotoCard + skeleton loader 구현

### Day 3 — 완료 경험 + 페이월

- [ ] `re:fined ✓` 완료 모달 (전화면, 공유 버튼)
- [ ] PaywallScreen 구현 (크레딧 패스 3종 + 앵커링)
- [ ] 앱 이름/번들 ID re:fine으로 변경
- [ ] 최종 QA + 애니메이션 점검
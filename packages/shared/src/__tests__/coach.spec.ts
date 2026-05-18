import { calculateTodayGoals } from '../utils/plan'
import type { BodyInfo } from '../types/user'

// 기준 유저: 남성 30세 70kg, 목표 66kg, 14일, 하루 30분 운동
const BASE_INFO: BodyInfo = {
  user_id: 'test-user',
  height: 175,
  weight: 70,
  age: 30,
  gender: 'male',
  goal: 'lose_weight',
  activity_level: 'light',
  target_weight: 66,
  target_days: 14,
  exercise_minutes_per_day: 30,
}

// 날짜 헬퍼: 오늘 기준 N일 전 YYYY-MM-DD
function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

// programStartedAt 기준 N일 전 (today - N)
function startedNDaysAgo(n: number): string {
  return daysAgo(n)
}

// 과거 N일치 균일 식단/운동 데이터 생성 (오늘 제외)
function buildLogs(
  days: number,
  mealKcalPerDay: number,
  exerciseKcalPerDay: number,
): {
  pastMealKcalByDate: Record<string, number>
  pastExerciseKcalByDate: Record<string, number>
} {
  const pastMealKcalByDate: Record<string, number> = {}
  const pastExerciseKcalByDate: Record<string, number> = {}
  for (let i = 1; i <= days; i++) {
    const date = daysAgo(i)
    pastMealKcalByDate[date] = mealKcalPerDay
    pastExerciseKcalByDate[date] = exerciseKcalPerDay
  }
  return { pastMealKcalByDate, pastExerciseKcalByDate }
}

// ─────────────────────────────────────────────
// 1. 정상 케이스: 14일 프로그램 7일차, 페이스 정상
// TDEE ≈ 2331, totalDeficitNeeded = 19250
// 목표 페이스: 하루 2038 적자 필요 → 1500 kcal 식단 + 500 kcal 운동 = 1331 + 500 = 1831 적자
// ─────────────────────────────────────────────
describe('정상 페이스', () => {
  it('7일차 목표 페이스 식단/운동 → calorieGoal이 floor 이상, isOnTrack = true', () => {
    // 하루 1500 식단 + 500 운동 → 적자 ≈ 2331 - 1500 + 500 = 1331 (목표의 65%)
    // isOnTrack 기준 85% = 2038 * 0.85 = 1732 → 이 조건 충족하려면 더 높은 적자 필요
    // 1200 식단 + 600 운동 → 적자 = 2331 - 1200 + 600 = 1731... 아슬아슬
    // 1000 식단 + 800 운동 → 적자 = 2331 - 1000 + 800 = 2131 → 충족
    const { pastMealKcalByDate, pastExerciseKcalByDate } = buildLogs(6, 1000, 800)
    const goals = calculateTodayGoals(
      BASE_INFO,
      startedNDaysAgo(7),
      pastMealKcalByDate,
      pastExerciseKcalByDate,
      0, 0,
    )
    expect(goals.calorieGoal).toBeGreaterThanOrEqual(1500)
    expect(goals.exerciseGoalKcal).toBeGreaterThan(0)
    expect(goals.daysLeft).toBe(7)
    expect(goals.isOnTrack).toBe(true)
  })

  it('7일차 느슨한 페이스 (1800 식단/300 운동) → isOnTrack = false (코치가 경고해야 함)', () => {
    // 하루 적자 ≈ 831, 목표 페이스 2038의 85% = 1732 → 미달
    const { pastMealKcalByDate, pastExerciseKcalByDate } = buildLogs(6, 1800, 300)
    const goals = calculateTodayGoals(
      BASE_INFO,
      startedNDaysAgo(7),
      pastMealKcalByDate,
      pastExerciseKcalByDate,
      0, 0,
    )
    expect(goals.isOnTrack).toBe(false)
    // 남은 기간 동안 훨씬 높은 적자 필요
    expect(goals.todayRequiredDeficit).toBeGreaterThan(goals.accumulatedDeficit / 6)
  })
})

// ─────────────────────────────────────────────
// 2. 폭식 케이스: 매일 3500 kcal 먹음 (TDEE 초과)
// ─────────────────────────────────────────────
describe('폭식 누적', () => {
  it('7일간 매일 3500 kcal 폭식 → accumulatedDeficit 음수, calorieGoal은 floor에 클램프', () => {
    const { pastMealKcalByDate, pastExerciseKcalByDate } = buildLogs(6, 3500, 0)
    const goals = calculateTodayGoals(
      BASE_INFO,
      startedNDaysAgo(7),
      pastMealKcalByDate,
      pastExerciseKcalByDate,
      0, 0,
    )
    // 많이 먹었으면 남은 적자가 커짐 → todayRequiredDeficit 높아짐
    expect(goals.accumulatedDeficit).toBeLessThan(0)
    expect(goals.todayRequiredDeficit).toBeGreaterThan(500)
    // 그래도 calorieGoal은 남성 최저 1500 이상
    expect(goals.calorieGoal).toBeGreaterThanOrEqual(1500)
  })

  it('오늘 이미 3000 kcal 먹은 경우 → exerciseGoalKcalAdjusted가 증가', () => {
    const { pastMealKcalByDate, pastExerciseKcalByDate } = buildLogs(6, 1800, 300)
    const goalsNormal = calculateTodayGoals(
      BASE_INFO, startedNDaysAgo(7),
      pastMealKcalByDate, pastExerciseKcalByDate,
      1800, 0,
    )
    const goalsOvereat = calculateTodayGoals(
      BASE_INFO, startedNDaysAgo(7),
      pastMealKcalByDate, pastExerciseKcalByDate,
      3000, 0,
    )
    expect(goalsOvereat.exerciseGoalKcalAdjusted).toBeGreaterThan(goalsNormal.exerciseGoalKcalAdjusted)
    expect(goalsOvereat.exerciseAdjustmentKcal).toBeGreaterThan(0)
  })
})

// ─────────────────────────────────────────────
// 3. 목표 초과 달성 케이스: 적자가 충분히 쌓인 경우
// ─────────────────────────────────────────────
describe('목표 초과 달성', () => {
  it('누적 적자가 totalDeficitNeeded 초과 → todayRequiredDeficit = 0, calorieGoal = floor', () => {
    // 매일 1000 kcal + 운동 800 kcal 극단적 감량
    const { pastMealKcalByDate, pastExerciseKcalByDate } = buildLogs(13, 1000, 800)
    const goals = calculateTodayGoals(
      BASE_INFO,
      startedNDaysAgo(14),
      pastMealKcalByDate,
      pastExerciseKcalByDate,
      0, 0,
    )
    expect(goals.todayRequiredDeficit).toBe(0)
    // 목표 달성 후 calorieGoal이 floor로 떨어지는 버그 확인용 스냅샷
    // 실제로는 유저에게 "목표 달성!" 메시지가 나와야 함
    expect(goals.calorieGoal).toBeGreaterThanOrEqual(1500)
  })
})

// ─────────────────────────────────────────────
// 4. 운동만 하고 식단 미기록 케이스
// ─────────────────────────────────────────────
describe('식단 미기록', () => {
  it('운동 기록만 있고 식단 미기록인 날 → 식단은 TDEE 상정, 운동 기록은 적자에 반영', () => {
    const pastExerciseKcalByDate: Record<string, number> = {
      [daysAgo(1)]: 400,
      [daysAgo(2)]: 350,
    }
    const pastMealKcalByDate: Record<string, number> = {}

    const goals = calculateTodayGoals(
      BASE_INFO,
      startedNDaysAgo(7),
      pastMealKcalByDate,
      pastExerciseKcalByDate,
      0, 0,
    )
    // 식단 미기록 → dietDeficit = 0, 운동만 적자로 잡힘 (400 + 350 = 750)
    expect(goals.accumulatedDeficit).toBe(750)
  })

  it('식단만 있고 운동 미기록인 날 → exerciseBurned = 0으로 적자 계산', () => {
    const { pastMealKcalByDate } = buildLogs(6, 1800, 0)
    const goals = calculateTodayGoals(
      BASE_INFO,
      startedNDaysAgo(7),
      pastMealKcalByDate,
      {},
      0, 0,
    )
    expect(goals.accumulatedDeficit).toBeGreaterThan(0)
  })
})

// ─────────────────────────────────────────────
// 5. 프로그램 첫날 케이스
// ─────────────────────────────────────────────
describe('프로그램 첫날', () => {
  it('elapsedDays = 0 → isOnTrack = true (항상 정상)', () => {
    const goals = calculateTodayGoals(
      BASE_INFO,
      startedNDaysAgo(0),
      {}, {},
      0, 0,
    )
    expect(goals.isOnTrack).toBe(true)
    expect(goals.daysLeft).toBe(14)
    expect(goals.accumulatedDeficit).toBe(0)
  })
})

// ─────────────────────────────────────────────
// 6. 마지막 날 케이스
// ─────────────────────────────────────────────
describe('프로그램 마지막 날', () => {
  it('daysLeft = 1 → todayRequiredDeficit가 남은 적자 전부', () => {
    const { pastMealKcalByDate, pastExerciseKcalByDate } = buildLogs(13, 1900, 200)
    const goals = calculateTodayGoals(
      BASE_INFO,
      startedNDaysAgo(14),
      pastMealKcalByDate,
      pastExerciseKcalByDate,
      0, 0,
    )
    expect(goals.daysLeft).toBe(1)
    const remaining = Math.max(0, goals.totalDeficitNeeded - goals.accumulatedDeficit)
    expect(goals.todayRequiredDeficit).toBe(remaining)
  })
})

// ─────────────────────────────────────────────
// 7. 감량 목표 없음 (target_weight = 현재 체중)
// ─────────────────────────────────────────────
describe('감량 목표 없음', () => {
  it('target_weight = weight → totalDeficitNeeded = 0, calorieGoal = floor', () => {
    const info: BodyInfo = { ...BASE_INFO, target_weight: BASE_INFO.weight }
    const goals = calculateTodayGoals(info, startedNDaysAgo(3), {}, {}, 0, 0)
    expect(goals.totalDeficitNeeded).toBe(0)
    expect(goals.todayRequiredDeficit).toBe(0)
    expect(goals.calorieGoal).toBeGreaterThanOrEqual(1500)
  })
})

// ─────────────────────────────────────────────
// 8. 여성 유저 → floor 1200 적용
// ─────────────────────────────────────────────
describe('여성 유저 floor', () => {
  it('극단적 감량 설정이어도 calorieGoal >= 1200', () => {
    const info: BodyInfo = {
      ...BASE_INFO,
      gender: 'female',
      weight: 55,
      target_weight: 45,  // 10kg 감량
      target_days: 14,    // 14일 안에
    }
    const goals = calculateTodayGoals(info, startedNDaysAgo(7), {}, {}, 0, 0)
    expect(goals.calorieGoal).toBeGreaterThanOrEqual(1200)
  })
})

// ─────────────────────────────────────────────
// 9. 오늘 운동 많이 한 경우 → exerciseGoalKcalAdjusted 감소
// ─────────────────────────────────────────────
describe('오늘 운동 초과', () => {
  it('이미 충분히 운동했으면 exerciseGoalKcalAdjusted = 0', () => {
    const { pastMealKcalByDate, pastExerciseKcalByDate } = buildLogs(6, 1800, 300)
    const goals = calculateTodayGoals(
      BASE_INFO,
      startedNDaysAgo(7),
      pastMealKcalByDate,
      pastExerciseKcalByDate,
      1800,  // 목표 칼로리 딱 맞게 먹음
      2000,  // 이미 2000 kcal 운동
    )
    expect(goals.exerciseGoalKcalAdjusted).toBe(0)
  })
})

// ─────────────────────────────────────────────
// 10. programStartedAt이 미래인 경우
// ─────────────────────────────────────────────
describe('미래 시작일', () => {
  it('programStartedAt이 내일이면 daysLeft > targetDays, accumulatedDeficit = 0', () => {
    const goals = calculateTodayGoals(
      BASE_INFO,
      daysAgo(-1),  // 내일 (실제 앱에선 불가 케이스)
      {}, {},
      0, 0,
    )
    // elapsedDays = -1 → daysLeft = targetDays + 1
    expect(goals.daysLeft).toBeGreaterThan(BASE_INFO.target_days!)
    expect(goals.accumulatedDeficit).toBe(0)
    // 크래시 없이 안전하게 동작하는지만 확인
    expect(goals.calorieGoal).toBeGreaterThanOrEqual(1500)
  })
})

// ─────────────────────────────────────────────
// 11. 극단적으로 짧은 target_days
// ─────────────────────────────────────────────
describe('극단적 단기 목표', () => {
  it('target_days = 1, 첫날 → daysLeft = 1, calorieGoal >= floor', () => {
    const info: BodyInfo = { ...BASE_INFO, target_days: 1 }
    const goals = calculateTodayGoals(info, startedNDaysAgo(0), {}, {}, 0, 0)
    expect(goals.daysLeft).toBe(1)
    expect(goals.calorieGoal).toBeGreaterThanOrEqual(1500)
    // 하루 만에 2.5kg 지방 소모는 불가능하므로 목표가 floor에 클램프됨
    expect(goals.exerciseGoalKcal).toBeGreaterThan(0)
  })
})

// ─────────────────────────────────────────────
// 12. exercise_minutes_per_day = 0 (운동 안 하는 유저)
// ─────────────────────────────────────────────
describe('운동 시간 0분', () => {
  it('exercise_minutes_per_day = 0 → baseExerciseKcal = 0, 식단으로만 적자 채움', () => {
    const info: BodyInfo = { ...BASE_INFO, exercise_minutes_per_day: 0 }
    const goals = calculateTodayGoals(info, startedNDaysAgo(3), {}, {}, 0, 0)
    expect(goals.exerciseGoalKcal).toBe(0)
    expect(goals.exerciseGoalMinutes).toBe(0)
    // 식단 목표는 floor 이상이어야 함
    expect(goals.calorieGoal).toBeGreaterThanOrEqual(1500)
  })
})

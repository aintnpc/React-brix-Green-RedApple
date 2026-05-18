import type { BodyInfo } from '../types/user'
import { calculateTDEE } from './tdee'

// 1kg 지방 = 7,700 kcal
const KCAL_PER_KG = 7700

// 러닝 기준 MET (kcal/kg/min) — 운동 시간→칼로리 변환용
const DEFAULT_EXERCISE_KCAL_PER_KG_PER_MIN = 0.133  // 러닝 8km/h 기준

export interface TodayGoals {
  calorieGoal: number                   // 오늘 식단 목표 (kcal)
  exerciseGoalKcal: number              // 오늘 운동 목표 (kcal) — 어제 실적 반영 기본값
  exerciseGoalMinutes: number           // 오늘 운동 목표 (분)
  exerciseGoalKcalAdjusted: number      // 실시간: 오늘 섭취까지 반영한 최종 목표
  exerciseGoalMinutesAdjusted: number
  exerciseAdjustmentKcal: number        // 양수=추가, 음수=감소 (오늘 섭취 기반 조정분)
  todayRequiredDeficit: number
  accumulatedDeficit: number
  totalDeficitNeeded: number
  daysLeft: number
  yesterdayDeficit: number              // 어제 실제 적자 (코치 메시지용)
  isOnTrack: boolean
}

/**
 * 누적 적자 기반 오늘 목표 동적 계산
 *
 * 핵심 원칙:
 *  1. 유저가 설정한 운동 가능 시간으로 운동 kcal 확정
 *  2. 남은 적자에서 운동 kcal를 뺀 나머지를 식단으로 채움
 *  3. 오늘 초과 섭취 시 운동 목표 실시간 증가
 */
export function calculateTodayGoals(
  info: BodyInfo,
  programStartedAt: string,
  pastMealKcalByDate: Record<string, number>,
  pastExerciseKcalByDate: Record<string, number>,
  todayConsumed: number = 0,
  todayBurned: number = 0,
  currentWeight?: number,
): TodayGoals {
  const weight = currentWeight ?? info.weight
  const tdee = calculateTDEE({ ...info, weight })
  const targetWeight = info.target_weight ?? info.weight
  const targetDays = info.target_days ?? 14
  const exerciseMinutes = info.exercise_minutes_per_day ?? 30

  // 운동 시간 → kcal (최신 체중 기반 MET 계산)
  const exerciseKcalPerMin = DEFAULT_EXERCISE_KCAL_PER_KG_PER_MIN * weight

  // 총 필요 적자
  const totalLoss = Math.max(0, info.weight - targetWeight)
  const fatLoss = Math.max(totalLoss - 1.5, 0)
  const totalDeficitNeeded = Math.round(fatLoss * KCAL_PER_KG)

  // 경과일 계산
  const start = new Date(programStartedAt)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  start.setHours(0, 0, 0, 0)
  const elapsedDays = Math.floor((today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
  const daysLeft = Math.max(1, targetDays - elapsedDays)

  // 어제까지 누적 달성 적자 + 어제 실적
  // 식단/운동 날짜 합집합 순회 — 식단 미기록 날은 TDEE만큼 먹은 것으로 상정 (식단 적자 = 0)
  let accumulatedDeficit = 0
  let yesterdayDeficit = 0
  const allDates = Array.from(
    new Set([...Object.keys(pastMealKcalByDate), ...Object.keys(pastExerciseKcalByDate)])
  ).sort()
  const yesterdayStr = (() => {
    const d = new Date(); d.setDate(d.getDate() - 1)
    return d.toISOString().slice(0, 10)
  })()
  for (const date of allDates) {
    const mealKcal = pastMealKcalByDate[date] ?? tdee  // 미기록 = TDEE 상정
    const dietDeficit = tdee - mealKcal
    const exerciseBurned = pastExerciseKcalByDate[date] ?? 0
    const dayDeficit = dietDeficit + exerciseBurned
    accumulatedDeficit += dayDeficit
    if (date === yesterdayStr) yesterdayDeficit = Math.round(dayDeficit)
  }
  accumulatedDeficit = Math.round(accumulatedDeficit)

  // 오늘 필요 적자 = 남은 적자 / 남은 날
  const remainingDeficit = Math.max(0, totalDeficitNeeded - accumulatedDeficit)
  const todayRequiredDeficit = Math.round(remainingDeficit / daysLeft)

  // 어제 실적 기반 baseExerciseKcal 동적 조정
  // 어제 기록이 없으면 (첫날 또는 어제 미기록) 고정값 사용
  const minBase = Math.round(exerciseKcalPerMin * exerciseMinutes)
  const hasYesterdayData = allDates.includes(yesterdayStr)
  const yesterdayGap = hasYesterdayData ? todayRequiredDeficit - yesterdayDeficit : 0
  const carryOver = Math.round(yesterdayGap * 0.5)
  const maxExercise = minBase * 2
  const baseExerciseKcal = Math.max(minBase * 0.5, Math.min(minBase + carryOver, maxExercise))

  // 식단 목표: 오늘 필요 적자에서 운동 kcal 빼고 남은 걸 식단으로
  const dietDeficitNeeded = Math.max(0, todayRequiredDeficit - baseExerciseKcal)
  const floor = info.gender === 'female' ? 1200 : 1500
  const calorieGoal = Math.max(Math.round(tdee - dietDeficitNeeded), floor)

  // 실시간 운동 목표: 초과 섭취 시에만 운동 목표 증가, 미달은 조정 없음 (아직 더 먹을 수 있음)
  const todayOverage = Math.max(0, todayConsumed - calorieGoal)
  const exerciseGoalKcalAdjusted = Math.max(0, Math.round(baseExerciseKcal + todayOverage - todayBurned))
  const exerciseAdjustmentKcal = Math.round(todayOverage)  // UI용 (항상 0 이상)

  const toMinutes = (kcal: number) => Math.ceil(kcal / exerciseKcalPerMin)

  // 현재 페이스 체크 — accumulatedDeficit는 어제까지 데이터만 포함하므로 elapsedDays - 1로 나눔
  const recordedDays = allDates.length
  const avgDailyDeficit = recordedDays > 0 ? accumulatedDeficit / recordedDays : todayRequiredDeficit
  const isOnTrack = avgDailyDeficit >= todayRequiredDeficit * 0.85

  return {
    calorieGoal,
    exerciseGoalKcal: Math.round(baseExerciseKcal),
    exerciseGoalMinutes: toMinutes(baseExerciseKcal),
    exerciseGoalKcalAdjusted,
    exerciseGoalMinutesAdjusted: toMinutes(exerciseGoalKcalAdjusted),
    exerciseAdjustmentKcal,
    todayRequiredDeficit,
    accumulatedDeficit,
    totalDeficitNeeded,
    daysLeft,
    yesterdayDeficit,
    isOnTrack,
  }
}

// 운동별 체중 1kg당 시간당 칼로리 소모 (MET 기반)
const EXERCISE_KCAL_PER_KG_PER_MIN: Record<string, number> = {
  walking: 0.063,      // 빠르게 걷기
  running: 0.133,      // 달리기 (8km/h)
  cycling: 0.1,        // 자전거
  stairs: 0.11,        // 계단 오르기
  jump_rope: 0.12,     // 줄넘기
  dance: 0.09,         // 댄스
}

export interface DailyPlan {
  // 오늘 필요한 칼로리 적자
  requiredDeficit: number
  // 식단으로 달성한 적자 (TDEE - 섭취 칼로리)
  dietDeficit: number
  // 운동으로 추가 소모해야 할 칼로리
  exerciseCaloriesNeeded: number
  // 추천 운동 목록 (필요 소모량 달성 기준)
  recommendations: ExerciseRecommendation[]
  // 목표까지 남은 날 (현재 페이스 기준)
  projectedDaysLeft: number
  // 오늘 운동까지 했을 때 목표일 단축/연장
  daysAheadOrBehind: number
}

export interface ExerciseRecommendation {
  type: string
  label: string
  minutes: number
  caloriesBurned: number
}

export interface WeightPlan {
  // 총 소모해야 할 칼로리
  totalCaloriesNeeded: number
  // 하루 필요 칼로리 적자
  dailyDeficitNeeded: number
  // 목표 기간 (일)
  targetDays: number
  // 식단만으로 감당 가능한 적자 (TDEE의 최대 25%)
  maxDietDeficitPerDay: number
  // 매일 최소 필요 운동 소모 칼로리
  minExerciseCaloriesPerDay: number
}

/**
 * 목표 체중까지의 전체 플랜 계산
 */
export function calculateWeightPlan(info: BodyInfo): WeightPlan {
  const tdee = calculateTDEE(info)
  const targetWeight = info.target_weight ?? info.weight
  const targetDays = info.target_days ?? 90

  const totalLoss = Math.max(0, info.weight - targetWeight)
  // 수분 감소 1.5kg은 칼로리 적자 없이 빠지므로 제외
  const fatLoss = Math.max(totalLoss - 1.5, 0)
  const totalCaloriesNeeded = fatLoss * KCAL_PER_KG

  const dailyDeficitNeeded = Math.round(totalCaloriesNeeded / targetDays)

  // 운동 기여분: 하루 적자의 40%, 최대 500 kcal
  const minExerciseCaloriesPerDay = Math.min(Math.round(dailyDeficitNeeded * 0.4), 500)
  const maxDietDeficitPerDay = dailyDeficitNeeded - minExerciseCaloriesPerDay

  return {
    totalCaloriesNeeded,
    dailyDeficitNeeded,
    targetDays,
    maxDietDeficitPerDay,
    minExerciseCaloriesPerDay,
  }
}

/**
 * 오늘 하루 기준 필요 운동량 계산
 * - 오늘 먹은 칼로리를 입력하면 추가로 태워야 할 칼로리 계산
 */
export function calculateDailyPlan(
  info: BodyInfo,
  todayConsumedCalories: number,
  todayBurnedCalories: number = 0
): DailyPlan {
  const tdee = calculateTDEE(info)
  const plan = calculateWeightPlan(info)

  // 식단으로 달성한 적자 (음수 = 초과 섭취)
  const dietDeficit = tdee - todayConsumedCalories

  // 오늘 필요한 총 적자
  const requiredDeficit = plan.dailyDeficitNeeded

  // 운동으로 더 태워야 할 칼로리 (이미 태운 것 차감)
  const exerciseCaloriesNeeded = Math.max(
    0,
    requiredDeficit - dietDeficit - todayBurnedCalories
  )

  // 추천 운동 생성
  const recommendations = generateRecommendations(
    exerciseCaloriesNeeded,
    info.weight
  )

  // 현재 페이스 기준 목표까지 남은 날 계산
  const todayActualDeficit = dietDeficit + todayBurnedCalories
  const remainingCalories =
    plan.totalCaloriesNeeded -
    (plan.dailyDeficitNeeded * (plan.targetDays - (info.target_days ?? 90)))

  const projectedDaysLeft =
    todayActualDeficit > 0
      ? Math.ceil(remainingCalories / todayActualDeficit)
      : plan.targetDays

  const daysAheadOrBehind = plan.targetDays - projectedDaysLeft

  return {
    requiredDeficit,
    dietDeficit,
    exerciseCaloriesNeeded,
    recommendations,
    projectedDaysLeft,
    daysAheadOrBehind,
  }
}

/**
 * 소모해야 할 칼로리 기준으로 운동 추천 생성
 */
function generateRecommendations(
  caloriesNeeded: number,
  weightKg: number
): ExerciseRecommendation[] {
  if (caloriesNeeded <= 0) return []

  const exercises = [
    { type: 'walking', label: '빠르게 걷기' },
    { type: 'running', label: '달리기' },
    { type: 'cycling', label: '자전거' },
    { type: 'jump_rope', label: '줄넘기' },
    { type: 'stairs', label: '계단 오르기' },
    { type: 'dance', label: '댄스' },
  ]

  return exercises.map(({ type, label }) => {
    const kcalPerMin = EXERCISE_KCAL_PER_KG_PER_MIN[type] * weightKg
    const minutes = Math.ceil(caloriesNeeded / kcalPerMin)
    const caloriesBurned = Math.round(kcalPerMin * minutes)
    return { type, label, minutes, caloriesBurned }
  })
}

/**
 * 운동 소모 칼로리 계산
 */
export function calculateExerciseCalories(
  type: string,
  minutes: number,
  weightKg: number
): number {
  const rate = EXERCISE_KCAL_PER_KG_PER_MIN[type] ?? 0.08
  return Math.round(rate * weightKg * minutes)
}

/**
 * 목표 달성 예상 날짜 계산
 */
export function getProjectedGoalDate(daysLeft: number): string {
  const date = new Date()
  date.setDate(date.getDate() + daysLeft)
  return date.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

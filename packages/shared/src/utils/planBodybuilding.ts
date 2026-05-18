import type { BodyInfo } from '../types/user'
import { calculateTDEE } from './tdee'

export type SplitType = 'full_body' | 'upper_lower' | 'push_pull_legs' | 'bro_split'
export type BuildGoal = 'bulk' | 'cut' | 'maintain'

export interface BuildBodyInfo extends BodyInfo {
  build_goal: BuildGoal
  training_days_per_week: number
  split_type: SplitType
  experience_level: 'beginner' | 'intermediate' | 'advanced'
  target_muscle_gain_kg?: number
}

export interface TodayBuildGoals {
  calorieGoal: number
  surplusOrDeficit: number
  proteinGoal: number
  carbGoal: number
  fatGoal: number
  todayMuscleGroups: string[]
  weeklyVolumeTarget: number
  accumulatedSets: number
  daysLeft: number
  isOnTrack: boolean
}

export interface PrescribedExercise {
  exerciseId: string
  muscleGroup: string
  sets: number
  targetReps: number
  targetWeightKg: number | null
  suggestedWeightKg: number | null
  progression?: 'weight_up' | 'sets_up' | 'weight_down' | 'hold' | 'first_session'
}

export interface DeloadStatus {
  isDeload: boolean
  currentWeek: number
  volumeMultiplier: number
}

// ─── Layer 1: 스케줄 재설계 ────────────────────────────────────────────────────
//
// 설계 원칙:
//   - 13개 근육 전부 커버 (abs/calves/traps/forearms 포함)
//   - 길항근 쌍 원칙: push 계열(chest/shoulders/triceps)은 같은 날,
//     pull 계열(lats/biceps/traps)은 같은 날
//   - 성별 보정: female은 glutes/hamstrings 강조, male은 chest/shoulders 강조

// 기본 스케줄 (성별 무관 베이스)
// 설계 원칙:
//   - 13개 근육 전부 커버 — abs/lower_back/calves/traps 모든 split에 배치
//   - PPL Push: abs 추가, Pull: lower_back 추가 (compound 데드리프트계와 시너지)
//   - upper_lower 상체: abs 추가 (주 2회 커버)
//   - compound 먼저, isolation 나중 순서 유지 (처방 함수에서 정렬)
const SPLIT_CYCLE_MALE: Record<SplitType, string[][]> = {
  // full_body: A/B 교대 — 전신을 두 패턴으로 나눠 전근육 커버
  full_body: [
    ['chest', 'triceps', 'shoulders', 'quads', 'abs'],        // A일
    [],
    ['lats', 'biceps', 'hamstrings', 'glutes', 'calves'],     // B일
    [],
    ['chest', 'triceps', 'shoulders', 'quads', 'abs'],        // A일
    [],
    [],
  ],
  // upper_lower: 길항근 쌍 원칙 + abs 상체일 배치
  upper_lower: [
    ['chest', 'lats', 'shoulders', 'triceps', 'biceps', 'abs'],   // 상체 (abs 주 2회)
    ['quads', 'hamstrings', 'glutes', 'calves', 'lower_back'],    // 하체 + lower_back
    [],
    ['chest', 'lats', 'shoulders', 'triceps', 'biceps', 'abs'],
    ['quads', 'hamstrings', 'glutes', 'calves', 'lower_back'],
    [],
    [],
  ],
  // push_pull_legs: abs→Push, lower_back→Pull (데드리프트 계열과 시너지)
  push_pull_legs: [
    ['chest', 'shoulders', 'triceps', 'abs'],                 // Push + abs
    ['lats', 'biceps', 'traps', 'lower_back'],                // Pull + lower_back
    ['quads', 'hamstrings', 'glutes', 'calves'],              // Legs
    ['chest', 'shoulders', 'triceps', 'abs'],
    ['lats', 'biceps', 'traps', 'lower_back'],
    ['quads', 'hamstrings', 'glutes', 'calves'],
    [],
  ],
  // bro_split: 부위별 집중
  bro_split: [
    ['chest', 'triceps'],
    ['lats', 'biceps', 'traps'],
    ['shoulders', 'abs'],
    ['quads', 'hamstrings'],
    ['glutes', 'calves', 'lower_back'],
    [],
    [],
  ],
}

// female: glutes/hamstrings 비중 ↑, 동일하게 abs/lower_back 전 split 커버
const SPLIT_CYCLE_FEMALE: Record<SplitType, string[][]> = {
  full_body: [
    ['glutes', 'hamstrings', 'quads', 'chest', 'abs'],        // A일: 하체 메인
    [],
    ['lats', 'biceps', 'shoulders', 'calves', 'triceps'],     // B일: 상체 메인
    [],
    ['glutes', 'hamstrings', 'quads', 'chest', 'abs'],        // A일
    [],
    [],
  ],
  upper_lower: [
    ['chest', 'lats', 'shoulders', 'triceps', 'biceps', 'abs'],
    ['glutes', 'hamstrings', 'quads', 'calves', 'lower_back'],
    [],
    ['chest', 'lats', 'shoulders', 'triceps', 'biceps', 'abs'],
    ['glutes', 'hamstrings', 'quads', 'calves', 'lower_back'],
    [],
    [],
  ],
  push_pull_legs: [
    ['chest', 'shoulders', 'triceps', 'abs'],
    ['lats', 'biceps', 'traps', 'lower_back'],
    ['glutes', 'hamstrings', 'quads', 'calves'],              // Legs: glutes 우선
    ['chest', 'shoulders', 'triceps', 'abs'],
    ['lats', 'biceps', 'traps', 'lower_back'],
    ['glutes', 'hamstrings', 'quads', 'calves'],
    [],
  ],
  bro_split: [
    ['glutes', 'hamstrings'],
    ['quads', 'calves', 'lower_back'],
    ['chest', 'triceps'],
    ['lats', 'biceps', 'traps'],
    ['shoulders', 'abs'],
    [],
    [],
  ],
}

export function getTodayMuscleGroups(
  splitType: SplitType,
  programStartedAt: string,
  gender: 'male' | 'female' = 'male',
  completedToday = false,  // 오늘 이미 세션 완료했으면 다음 일차 표시
): string[] {
  const table = gender === 'female' ? SPLIT_CYCLE_FEMALE : SPLIT_CYCLE_MALE
  const cycle = table[splitType]
  if (!cycle) return []
  const start = new Date(programStartedAt)
  const today = new Date()
  start.setHours(0, 0, 0, 0)
  today.setHours(0, 0, 0, 0)
  const elapsed = Math.floor((today.getTime() - start.getTime()) / 86400000)
  const offset = completedToday ? 1 : 0
  const dayInCycle = ((elapsed + offset) % cycle.length + cycle.length) % cycle.length
  return cycle[dayInCycle] ?? []
}

// ─── Layer 2: 운동 선택 원칙 ───────────────────────────────────────────────────
//
// compound 우선 판단: 이름에 compound 키워드가 포함되면 우선 선택
// 장비 우선순위: beginner=머신>덤벨>맨몸, intermediate=바벨>덤벨>케이블, advanced=바벨>케이블>머신
// 주기화: 3주 단위로 운동 pool을 A/B/C 세 구간으로 나눠 교체

const COMPOUND_KEYWORDS = [
  'press', 'squat', 'deadlift', 'row', 'pull-up', 'pullup',
  'chin-up', 'chinup', 'dip', 'lunge', 'clean', 'snatch', 'thruster',
]

function isCompound(name: string): boolean {
  const lower = name.toLowerCase()
  return COMPOUND_KEYWORDS.some((k) => lower.includes(k))
}

// 경력별 장비 우선순위 (index 낮을수록 선호)
const EQUIPMENT_PRIORITY: Record<string, string[]> = {
  beginner:     ['machine', 'dumbbell', 'resistance_band', 'none', 'cable', 'barbell', 'kettlebell'],
  intermediate: ['barbell', 'dumbbell', 'cable', 'machine', 'kettlebell', 'resistance_band', 'none'],
  advanced:     ['barbell', 'cable', 'machine', 'dumbbell', 'kettlebell', 'resistance_band', 'none'],
}

function equipmentScore(equipment: string, level: string): number {
  const priority = EQUIPMENT_PRIORITY[level] ?? EQUIPMENT_PRIORITY.intermediate
  const idx = priority.indexOf(equipment)
  return idx === -1 ? priority.length : idx
}

interface ExerciseForPrescription {
  id: string
  name: string
  primary_muscles: string[]
  equipment: string
}

// 3주 주기화: pool을 3등분해서 주차에 따라 A/B/C 구간 선택
function getPeriodizationSlice<T>(pool: T[], weekNumber: number, sliceSize: number): T[] {
  if (pool.length === 0) return []
  const period = Math.floor(((weekNumber - 1) % 9) / 3) // 0=A, 1=B, 2=C (9주 사이클)
  const chunkSize = Math.max(sliceSize, Math.ceil(pool.length / 3))
  const start = period * chunkSize
  // 해당 구간에서 sliceSize개 — 모자라면 pool 앞쪽에서 보충
  const slice = pool.slice(start, start + sliceSize)
  if (slice.length < sliceSize) {
    const extra = pool.slice(0, sliceSize - slice.length)
    return [...slice, ...extra]
  }
  return slice
}

export function selectExercises(
  muscle: string,
  level: 'beginner' | 'intermediate' | 'advanced',
  goal: BuildGoal,
  weekNumber: number,
  exercisesDb: ExerciseForPrescription[],
  count: number,
  lastWeightIds?: Set<string>,
  replacedIds?: Set<string>,
): ExerciseForPrescription[] {
  // 교체 이력이 있는 운동은 자동 처방에서 제외
  const candidates = exercisesDb.filter(
    (e) => e.primary_muscles.includes(muscle) && !replacedIds?.has(e.id)
  )
  if (candidates.length === 0) return []

  // compound / isolation 분리
  const compounds = candidates.filter((e) => isCompound(e.name))
  const isolations = candidates.filter((e) => !isCompound(e.name))

  // 각 그룹 내 장비 점수 정렬
  const sortByEquip = (arr: ExerciseForPrescription[]) =>
    [...arr].sort((a, b) => equipmentScore(a.equipment, level) - equipmentScore(b.equipment, level))

  const sortedCompounds  = sortByEquip(compounds)
  const sortedIsolations = sortByEquip(isolations)

  // 목표별 compound:isolation 비율 결정
  // bulk: compound 최대, cut: isolation 비율 ↑ (고반복 isolation 포함)
  let compoundCount: number
  if (goal === 'bulk') {
    compoundCount = Math.min(count, Math.ceil(count * 0.8))
  } else if (goal === 'cut') {
    compoundCount = Math.min(count, Math.ceil(count * 0.5))
  } else {
    compoundCount = Math.min(count, Math.ceil(count * 0.65))
  }
  const isolationCount = count - compoundCount

  // 주기화: 3주 단위로 다른 운동 구간 선택
  const pickedCompounds  = getPeriodizationSlice(sortedCompounds, weekNumber, compoundCount)
  const pickedIsolations = getPeriodizationSlice(sortedIsolations, weekNumber, isolationCount)

  // compound 부족하면 isolation으로 채움, 중복 exerciseId 제거
  const seen = new Set<string>()
  const combined: ExerciseForPrescription[] = []
  for (const e of [...pickedCompounds, ...pickedIsolations]) {
    if (!seen.has(e.id)) { seen.add(e.id); combined.push(e) }
  }
  if (combined.length < count) {
    const remaining = candidates.filter((e) => !seen.has(e.id))
    for (const e of remaining) {
      if (combined.length >= count) break
      seen.add(e.id)
      combined.push(e)
    }
  }

  // 기록 있는 운동(진행도 추적 가능) 최우선 — 같은 조건이면 앞에 배치
  if (lastWeightIds && lastWeightIds.size > 0) {
    combined.sort((a, b) => {
      const aHas = lastWeightIds.has(a.id) ? 0 : 1
      const bHas = lastWeightIds.has(b.id) ? 0 : 1
      return aHas - bHas
    })
  }

  return combined.slice(0, count)
}

// ─── Layer 3: 볼륨 처방 ────────────────────────────────────────────────────────
//
// 목표 × 경력 매트릭스
//           beginner    intermediate   advanced
// bulk       3×10        4×8            5×5
// cut        3×12        4×12           5×10   ← beginner cut: 15→12 (첫날 15회는 과부하)
// maintain   3×12        4×10           5×8
//
// compound: 위 기준 그대로
// isolation: reps +3
// 집중부위(1순위): 세트 +1, 운동 수 +1
// 집중부위(2순위): 세트 +1

const VOLUME_MATRIX: Record<BuildGoal, Record<string, { sets: number; reps: number }>> = {
  bulk: {
    beginner:     { sets: 3, reps: 10 },
    intermediate: { sets: 4, reps: 8  },
    advanced:     { sets: 5, reps: 5  },
  },
  cut: {
    beginner:     { sets: 3, reps: 12 }, // 15→12: 초보자 첫날 15회는 다음날 기권 유발
    intermediate: { sets: 4, reps: 12 },
    advanced:     { sets: 5, reps: 10 },
  },
  maintain: {
    beginner:     { sets: 3, reps: 12 },
    intermediate: { sets: 4, reps: 10 },
    advanced:     { sets: 5, reps: 8  },
  },
}

export function prescribeSetsReps(
  level: 'beginner' | 'intermediate' | 'advanced',
  goal: BuildGoal,
  isCompoundExercise: boolean,
  focusRank: number | null, // null=집중부위 아님, 0=1순위, 1=2순위 ...
  isDeload: boolean,
): { sets: number; reps: number } {
  const base = VOLUME_MATRIX[goal][level] ?? { sets: 3, reps: 10 }
  let { sets, reps } = base

  // isolation: reps +3
  if (!isCompoundExercise) reps += 3

  // 집중부위 보정
  if (focusRank === 0) sets += 1      // 1순위
  else if (focusRank === 1) sets += 1 // 2순위

  // 딜로드: 세트 50%, 최소 2세트
  if (isDeload) sets = Math.max(2, Math.round(sets * 0.5))

  return { sets, reps }
}

// ─── Layer 4: Progressive Overload (더블 프로그레션) ──────────────────────────
//
// 더블 프로그레션 원칙:
//   1단계: 무게 고정 + 세트 점진 증가 (base → base+2 세트까지)
//   2단계: 세트 상한 도달 시 무게 +2.5kg, 세트 base로 리셋
//
// RPE 기반 조정:
//   easy  → 세트 +1 (세트 상한 도달 시 무게 +2.5kg + 세트 리셋)
//   max   → 무게 -2.5kg + 세트 리셋
//   그 외 → 유지
//
// 첫 세션 기본값:
//   barbell: beginner 20kg / intermediate 40kg / advanced 60kg
//   dumbbell: beginner 5kg / intermediate 12kg / advanced 20kg

const FIRST_SESSION_DEFAULTS: Record<string, Record<string, number | null>> = {
  barbell:         { beginner: 20,   intermediate: 40,   advanced: 60   },
  dumbbell:        { beginner: 5,    intermediate: 12,   advanced: 20   },
  machine:         { beginner: null, intermediate: null, advanced: null },
  cable:           { beginner: 5,    intermediate: 15,   advanced: 25   },
  kettlebell:      { beginner: 8,    intermediate: 16,   advanced: 24   },
  resistance_band: { beginner: null, intermediate: null, advanced: null },
  none:            { beginner: null, intermediate: null, advanced: null },
}

export interface ProgressiveResult {
  suggestedWeightKg: number | null
  suggestedSets: number | null  // null이면 기본 매트릭스 사용
  progression: 'weight_up' | 'sets_up' | 'weight_down' | 'hold' | 'first_session'
}

export function suggestProgressiveOverload(
  lastMaxWeightKg: number | null | undefined,
  lastSetRpe: string | null | undefined,
  baseSets: number,
  currentSets: number | null | undefined,
  equipment?: string,
  level: 'beginner' | 'intermediate' | 'advanced' = 'beginner',
): ProgressiveResult {
  // 첫 세션 — 경력별 기본값
  if (lastMaxWeightKg == null || lastMaxWeightKg === 0) {
    const equipDefaults = equipment ? (FIRST_SESSION_DEFAULTS[equipment] ?? null) : null
    const def = equipDefaults ? (equipDefaults[level] ?? null) : null
    return { suggestedWeightKg: def, suggestedSets: null, progression: 'first_session' }
  }

  const maxSets = baseSets + 2  // 더블 프로그레션 세트 상한
  const effectiveSets = currentSets ?? baseSets

  if (lastSetRpe === 'easy') {
    if (effectiveSets >= maxSets) {
      // 세트 상한 → 무게 올리고 세트 리셋
      return {
        suggestedWeightKg: Math.round((lastMaxWeightKg + 2.5) * 2) / 2,
        suggestedSets: baseSets,
        progression: 'weight_up',
      }
    }
    // 세트 +1
    return {
      suggestedWeightKg: lastMaxWeightKg,
      suggestedSets: effectiveSets + 1,
      progression: 'sets_up',
    }
  }

  if (lastSetRpe === 'max') {
    const reduced = Math.round((lastMaxWeightKg - 2.5) * 2) / 2
    return {
      suggestedWeightKg: Math.max(0.5, reduced),
      suggestedSets: baseSets,
      progression: 'weight_down',
    }
  }

  return {
    suggestedWeightKg: lastMaxWeightKg,
    suggestedSets: effectiveSets,
    progression: 'hold',
  }
}

/** @deprecated prescribeRoutine 내부의 suggestProgressiveOverload를 직접 사용하세요 */
export function suggestProgressiveWeight(
  lastMaxWeightKg: number | null | undefined,
  lastSetRpe: string | null | undefined,
  equipment?: string,
  level: 'beginner' | 'intermediate' | 'advanced' = 'beginner',
): number | null {
  const result = suggestProgressiveOverload(lastMaxWeightKg, lastSetRpe, 3, null, equipment, level)
  return result.suggestedWeightKg
}

// ─── 온보딩 집중 부위 그룹 → 개별 근육 ID 매핑 ──────────────────────────────
// 온보딩에서 'arms', 'legs' 같은 그룹 레이블을 선택하지만
// 처방은 'biceps', 'quads' 같은 개별 근육 ID 기준으로 동작하므로 변환 필요

const FOCUS_PART_TO_MUSCLES: Record<string, string[]> = {
  chest:     ['chest'],
  back:      ['lats', 'traps'],
  shoulders: ['shoulders'],
  arms:      ['biceps', 'triceps'],
  legs:      ['quads', 'hamstrings', 'glutes', 'calves'],
  abs:       ['abs'],
  glutes:    ['glutes', 'hamstrings'],
  lower_back:['lower_back'],
}

export function expandFocusParts(focusParts: string[]): string[] {
  const result: string[] = []
  for (const part of focusParts) {
    const muscles = FOCUS_PART_TO_MUSCLES[part]
    if (muscles) {
      for (const m of muscles) {
        if (!result.includes(m)) result.push(m)
      }
    } else {
      // 이미 개별 근육 ID인 경우 그대로 사용
      if (!result.includes(part)) result.push(part)
    }
  }
  return result
}

// ─── 통합 처방 함수 ────────────────────────────────────────────────────────────

export interface PrescribeContext {
  // 운동별 마지막 세션에서 실제 수행한 세트 수 (더블 프로그레션용)
  lastSetsCount?: Record<string, number>
  // 교체된 운동 ID — 처방에서 제외
  replacedExerciseIds?: Set<string>
  // 실제 세션 완료 횟수 (주기화 기준)
  completedSessionCount?: number
  // 단백질 달성률 (0~1) — 볼륨 보정용
  proteinRatioLast3Days?: number
  // 최근 3주 실제 세션 수 — 딜로드 조건 보정용 (없으면 날짜 기준 폴백)
  recentWeekSessionCounts?: [number, number, number] // [1주전, 2주전, 3주전]
}

export function prescribeRoutine(
  info: BuildBodyInfo,
  muscleGroups: string[],
  programStartedAt?: string,
  lastWeights?: Record<string, number | null>,
  lastRpes?: Record<string, string | null>,
  exercisesDb?: ExerciseForPrescription[],
  ctx?: PrescribeContext,
): PrescribedExercise[] {
  const completedSessions = ctx?.completedSessionCount ?? 0

  // 딜로드: 달력 기준 폐기 — 세션 수 기준 (14세션마다, 즉 주 3회 기준 약 4.5주)
  // 세션 수가 없으면 날짜 기준 폴백
  const isDeload = (() => {
    if (completedSessions > 0) {
      return completedSessions > 0 && completedSessions % 14 === 0
    }
    if (!programStartedAt) return false
    const deload = getDeloadStatus(programStartedAt)
    if (!deload.isDeload) return false
    // 날짜 폴백이지만 실제로 거의 안 운동했으면 딜로드 스킵
    if (!ctx?.recentWeekSessionCounts) return true
    const [w1, w2, w3] = ctx.recentWeekSessionCounts
    return w1 >= 2 && w2 >= 2 && w3 >= 2
  })()

  // 주기화: 세션 수 기반 (3세션 = 1주 단위), 없으면 날짜 폴백
  const weekNumber = completedSessions > 0
    ? Math.floor(completedSessions / 3) + 1
    : (programStartedAt ? getDeloadStatus(programStartedAt).currentWeek : 1)

  // 단백질 3일 평균이 70% 미만이면 볼륨 소폭 감량 플래그
  const proteinLow = (ctx?.proteinRatioLast3Days ?? 1) < 0.70

  const focusParts: string[] = expandFocusParts(info.focus_parts ?? [])
  const replacedIds = ctx?.replacedExerciseIds ?? new Set<string>()
  const lastWeightIds = lastWeights
    ? new Set(Object.keys(lastWeights).filter((id) => lastWeights[id] != null))
    : new Set<string>()

  if (!exercisesDb || exercisesDb.length === 0) return []

  // 경력별 근육당 최대 운동 수 — 초보자는 세션 볼륨 과부하 방지
  const MAX_EX_PER_MUSCLE: Record<string, number> = {
    beginner: 1, intermediate: 2, advanced: 2,
  }
  const maxExPerMuscle = MAX_EX_PER_MUSCLE[info.experience_level] ?? 2

  const allPrescribed = muscleGroups.flatMap((muscle) => {
    const focusRank = focusParts.indexOf(muscle)
    // 집중부위(1·2순위)는 +1, 경력별 상한 적용
    const baseCount = focusRank >= 0 && focusRank <= 1
      ? Math.min(maxExPerMuscle + 1, 3)
      : maxExPerMuscle
    const exerciseCount = baseCount

    const selected = selectExercises(
      muscle,
      info.experience_level,
      info.build_goal,
      weekNumber,
      exercisesDb,
      exerciseCount,
      lastWeightIds,
      replacedIds,
    )

    return selected.map((ex) => {
      const compound = isCompound(ex.name)
      const rank = focusRank >= 0 ? focusRank : null
      const { sets: baseSets, reps } = prescribeSetsReps(
        info.experience_level,
        info.build_goal,
        compound,
        rank,
        isDeload,
      )

      const lastWeight = lastWeights?.[ex.id] ?? null
      const lastRpe    = lastRpes?.[ex.id] ?? null
      const lastSets   = ctx?.lastSetsCount?.[ex.id] ?? null

      const progressive = suggestProgressiveOverload(lastWeight, lastRpe, baseSets, lastSets, ex.equipment, info.experience_level)

      // 단백질 부족이면 제안 세트에서 -1 (최소 2세트)
      // progressive.suggestedSets는 보존 — 다음 세션에 단백질 회복하면 그대로 이어감
      const progressiveSets = progressive.suggestedSets ?? baseSets
      const finalSets = !isDeload && proteinLow
        ? Math.max(progressiveSets - 1, 2)
        : progressiveSets

      return {
        exerciseId: ex.id,
        muscleGroup: muscle,
        sets: finalSets,
        targetReps: reps,
        targetWeightKg: null,
        suggestedWeightKg: progressive.suggestedWeightKg,
        progression: progressive.progression,
        _isCompound: compound,
      } as PrescribedExercise & { progression: ProgressiveResult['progression']; _isCompound: boolean }
    })
  })

  // 운동 순서 정렬: compound 먼저, isolation 나중
  // 진짜 트레이너가 짜는 순서 — 큰 근육/다관절을 먼저 지치지 않은 상태에서 수행
  allPrescribed.sort((a, b) => {
    const ac = (a as any)._isCompound ? 0 : 1
    const bc = (b as any)._isCompound ? 0 : 1
    return ac - bc
  })

  // 임시 필드 제거 후 반환
  return allPrescribed.map(({ _isCompound, ...rest }: any) => rest)
}

// ─── 칼로리 / 매크로 ──────────────────────────────────────────────────────────

const PROTEIN_RATIO: Record<string, number> = {
  beginner:     1.6,
  intermediate: 2.0,
  advanced:     2.2,
}

const SURPLUS_KCAL: Record<BuildGoal, number> = {
  bulk:     300,
  cut:     -400,
  maintain:  0,
}

export function calculateBuildGoals(
  info: BuildBodyInfo,
  programStartedAt: string,
  accumulatedSets = 0,
  completedToday = false,
): TodayBuildGoals {
  const tdee = calculateTDEE(info)
  const surplus = SURPLUS_KCAL[info.build_goal]
  const calorieGoal = Math.round(tdee + surplus)

  const proteinRatio = PROTEIN_RATIO[info.experience_level] ?? 2.0
  const proteinGoal = Math.round(info.weight * proteinRatio)
  const proteinKcal = proteinGoal * 4

  const fatGoal = Math.max(50, Math.round(info.weight * 0.8))
  const fatKcal = fatGoal * 9

  const carbKcal = Math.max(0, calorieGoal - proteinKcal - fatKcal)
  const carbGoal = Math.round(carbKcal / 4)

  const todayMuscleGroups = getTodayMuscleGroups(
    info.split_type,
    programStartedAt,
    info.gender,
    completedToday,
  )

  const setsPerMuscle: Record<string, number> = {
    beginner:     10,
    intermediate: 16,
    advanced:     20,
  }
  const muscleCount = 13
  const weeklyVolumeTarget = (setsPerMuscle[info.experience_level] ?? 16) * muscleCount

  const start = new Date(programStartedAt)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  start.setHours(0, 0, 0, 0)
  const elapsedDays = Math.floor((today.getTime() - start.getTime()) / 86400000)
  const daysLeft = Math.max(1, 84 - elapsedDays)

  const elapsedWeeks = Math.max(1, elapsedDays / 7)
  const avgWeeklySets = accumulatedSets / elapsedWeeks
  const isOnTrack = elapsedDays < 3 ? true : avgWeeklySets >= weeklyVolumeTarget * 0.8

  return {
    calorieGoal,
    surplusOrDeficit: surplus,
    proteinGoal,
    carbGoal,
    fatGoal,
    todayMuscleGroups,
    weeklyVolumeTarget,
    accumulatedSets,
    daysLeft,
    isOnTrack,
  }
}

export function getDeloadStatus(programStartedAt: string): DeloadStatus {
  const start = new Date(programStartedAt)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  start.setHours(0, 0, 0, 0)
  const elapsedDays = Math.floor((today.getTime() - start.getTime()) / 86400000)
  const currentWeek = Math.floor(elapsedDays / 7) + 1
  const isDeload = currentWeek % 4 === 0
  return {
    isDeload,
    currentWeek,
    volumeMultiplier: isDeload ? 0.5 : 1.0,
  }
}

export function calculateWorkoutCalories(
  sets: number,
  weightKg: number,
  durationMinutes: number,
): number {
  const MET = 5.5
  return Math.round((MET * weightKg * durationMinutes) / 60)
}

export function getMacroProgress(
  goals: TodayBuildGoals,
  consumed: { calories: number; protein: number; carbs: number; fat: number },
) {
  return {
    calorieRatio:   Math.min(1, consumed.calories / goals.calorieGoal),
    proteinRatio:   Math.min(1, consumed.protein  / goals.proteinGoal),
    carbRatio:      Math.min(1, consumed.carbs    / goals.carbGoal),
    fatRatio:       Math.min(1, consumed.fat      / goals.fatGoal),
    proteinDeficit: Math.max(0, goals.proteinGoal - consumed.protein),
  }
}

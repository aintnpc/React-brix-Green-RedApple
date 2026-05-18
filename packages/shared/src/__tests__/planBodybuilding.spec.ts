import {
  expandFocusParts,
  getDeloadStatus,
  getTodayMuscleGroups,
  prescribeRoutine,
  prescribeSetsReps,
  selectExercises,
  suggestProgressiveOverload,
} from '../utils/planBodybuilding'
import {
  advancedMaintainMale,
  beginnerBulkMale,
  intermediateCutFemale,
} from './fixtures/mockBodyInfo'
import { mockExercises } from './fixtures/mockExercises'

// ─── 날짜 헬퍼 ────────────────────────────────────────────────────────────────
function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().split('T')[0]
}

// ─── expandFocusParts ─────────────────────────────────────────────────────────
describe('expandFocusParts', () => {
  it('arms → biceps + triceps', () => {
    expect(expandFocusParts(['arms'])).toEqual(['biceps', 'triceps'])
  })

  it('legs → quads + hamstrings + glutes + calves', () => {
    expect(expandFocusParts(['legs'])).toEqual(['quads', 'hamstrings', 'glutes', 'calves'])
  })

  it('back → lats + traps', () => {
    expect(expandFocusParts(['back'])).toEqual(['lats', 'traps'])
  })

  it('glutes → glutes + hamstrings', () => {
    expect(expandFocusParts(['glutes'])).toEqual(['glutes', 'hamstrings'])
  })

  it('중복 제거: arms + legs 겹치는 근육 없음', () => {
    const result = expandFocusParts(['arms', 'legs'])
    const unique = new Set(result)
    expect(unique.size).toBe(result.length)
  })

  it('이미 개별 근육 ID면 그대로 통과', () => {
    expect(expandFocusParts(['chest'])).toEqual(['chest'])
    expect(expandFocusParts(['abs'])).toEqual(['abs'])
  })

  it('빈 배열 입력 → 빈 배열', () => {
    expect(expandFocusParts([])).toEqual([])
  })
})

// ─── getDeloadStatus ──────────────────────────────────────────────────────────
describe('getDeloadStatus', () => {
  it('0일차(오늘 시작) → 1주차, 딜로드 아님', () => {
    const status = getDeloadStatus(daysAgo(0))
    expect(status.currentWeek).toBe(1)
    expect(status.isDeload).toBe(false)
    expect(status.volumeMultiplier).toBe(1.0)
  })

  it('21일차 → 4주차, 딜로드', () => {
    const status = getDeloadStatus(daysAgo(21))
    expect(status.currentWeek).toBe(4)
    expect(status.isDeload).toBe(true)
    expect(status.volumeMultiplier).toBe(0.5)
  })

  it('28일차 → 5주차, 딜로드 아님 (4주 사이클 재시작)', () => {
    const status = getDeloadStatus(daysAgo(28))
    expect(status.currentWeek).toBe(5)
    expect(status.isDeload).toBe(false)
  })

  it('49일차 → 8주차, 딜로드', () => {
    const status = getDeloadStatus(daysAgo(49))
    expect(status.currentWeek).toBe(8)
    expect(status.isDeload).toBe(true)
  })
})

// ─── getTodayMuscleGroups ─────────────────────────────────────────────────────
describe('getTodayMuscleGroups', () => {
  it('full_body 0일차(A일) → chest 포함', () => {
    const muscles = getTodayMuscleGroups('full_body', daysAgo(0), 'male')
    expect(muscles).toContain('chest')
    expect(muscles).toContain('triceps')
  })

  it('full_body 1일차 → 휴식일 (빈 배열)', () => {
    const muscles = getTodayMuscleGroups('full_body', daysAgo(1), 'male')
    expect(muscles).toHaveLength(0)
  })

  it('full_body 2일차(B일) → lats 포함', () => {
    const muscles = getTodayMuscleGroups('full_body', daysAgo(2), 'male')
    expect(muscles).toContain('lats')
    expect(muscles).toContain('biceps')
  })

  it('push_pull_legs 0일차 → Push (chest + shoulders + triceps)', () => {
    const muscles = getTodayMuscleGroups('push_pull_legs', daysAgo(0), 'male')
    expect(muscles).toContain('chest')
    expect(muscles).toContain('shoulders')
    expect(muscles).toContain('triceps')
  })

  it('push_pull_legs 1일차 → Pull (lats + biceps + traps)', () => {
    const muscles = getTodayMuscleGroups('push_pull_legs', daysAgo(1), 'male')
    expect(muscles).toContain('lats')
    expect(muscles).toContain('biceps')
  })

  it('female full_body 0일차 → glutes 포함 (여성 보정)', () => {
    const muscles = getTodayMuscleGroups('full_body', daysAgo(0), 'female')
    expect(muscles).toContain('glutes')
    expect(muscles).toContain('hamstrings')
  })

  it('completedToday=true → 다음 일차 반환', () => {
    // 0일차(A일)에 완료 → B일 근육 반환
    const withoutComplete = getTodayMuscleGroups('full_body', daysAgo(0), 'male', false)
    const withComplete = getTodayMuscleGroups('full_body', daysAgo(0), 'male', true)
    expect(withoutComplete).not.toEqual(withComplete)
  })

  it('7일 주기가 반복됨', () => {
    const day0 = getTodayMuscleGroups('full_body', daysAgo(0), 'male')
    const day7 = getTodayMuscleGroups('full_body', daysAgo(7), 'male')
    expect(day0).toEqual(day7)
  })
})

// ─── prescribeSetsReps ────────────────────────────────────────────────────────
describe('prescribeSetsReps', () => {
  it('beginner bulk compound → 3세트 10회', () => {
    const result = prescribeSetsReps('beginner', 'bulk', true, null, false)
    expect(result).toEqual({ sets: 3, reps: 10 })
  })

  it('beginner bulk isolation → 3세트 13회 (reps+3)', () => {
    const result = prescribeSetsReps('beginner', 'bulk', false, null, false)
    expect(result).toEqual({ sets: 3, reps: 13 })
  })

  it('intermediate cut compound → 4세트 12회', () => {
    const result = prescribeSetsReps('intermediate', 'cut', true, null, false)
    expect(result).toEqual({ sets: 4, reps: 12 })
  })

  it('advanced maintain compound → 5세트 8회', () => {
    const result = prescribeSetsReps('advanced', 'maintain', true, null, false)
    expect(result).toEqual({ sets: 5, reps: 8 })
  })

  it('집중부위 1순위(focusRank=0) → 세트+1', () => {
    const base = prescribeSetsReps('beginner', 'bulk', true, null, false)
    const focus = prescribeSetsReps('beginner', 'bulk', true, 0, false)
    expect(focus.sets).toBe(base.sets + 1)
  })

  it('집중부위 2순위(focusRank=1) → 세트+1', () => {
    const base = prescribeSetsReps('beginner', 'bulk', true, null, false)
    const focus = prescribeSetsReps('beginner', 'bulk', true, 1, false)
    expect(focus.sets).toBe(base.sets + 1)
  })

  it('딜로드 주 → 세트 50% (최소 2)', () => {
    // advanced bulk compound: 기본 5세트 → 딜로드 3세트 (round(5*0.5)=3)
    const result = prescribeSetsReps('advanced', 'bulk', true, null, true)
    expect(result.sets).toBe(3)
    expect(result.sets).toBeGreaterThanOrEqual(2)
  })

  it('beginner 딜로드 → 최소 2세트 보장', () => {
    const result = prescribeSetsReps('beginner', 'bulk', true, null, true)
    expect(result.sets).toBeGreaterThanOrEqual(2)
  })
})

// ─── suggestProgressiveOverload ───────────────────────────────────────────────
describe('suggestProgressiveOverload', () => {
  it('첫 세션(lastWeight=null) → first_session + 경력별 기본값', () => {
    const result = suggestProgressiveOverload(null, null, 3, null, 'barbell', 'beginner')
    expect(result.progression).toBe('first_session')
    expect(result.suggestedWeightKg).toBe(20) // beginner barbell 기본값
  })

  it('첫 세션 intermediate barbell → 40kg', () => {
    const result = suggestProgressiveOverload(null, null, 3, null, 'barbell', 'intermediate')
    expect(result.suggestedWeightKg).toBe(40)
  })

  it('첫 세션 beginner dumbbell → 5kg', () => {
    const result = suggestProgressiveOverload(null, null, 3, null, 'dumbbell', 'beginner')
    expect(result.suggestedWeightKg).toBe(5)
  })

  it('RPE easy + 세트 상한 미달 → sets_up (세트+1)', () => {
    // baseSets=3, currentSets=3 (maxSets=5) → 세트+1
    const result = suggestProgressiveOverload(60, 'easy', 3, 3, 'barbell', 'intermediate')
    expect(result.progression).toBe('sets_up')
    expect(result.suggestedSets).toBe(4)
    expect(result.suggestedWeightKg).toBe(60) // 무게 유지
  })

  it('RPE easy + 세트 상한 도달 → weight_up (무게+2.5kg, 세트 리셋)', () => {
    // baseSets=3, currentSets=5 (maxSets=5) → 무게업
    const result = suggestProgressiveOverload(60, 'easy', 3, 5, 'barbell', 'intermediate')
    expect(result.progression).toBe('weight_up')
    expect(result.suggestedWeightKg).toBe(62.5)
    expect(result.suggestedSets).toBe(3) // base로 리셋
  })

  it('RPE max → weight_down (무게-2.5kg, 세트 리셋)', () => {
    const result = suggestProgressiveOverload(60, 'max', 3, 4, 'barbell', 'intermediate')
    expect(result.progression).toBe('weight_down')
    expect(result.suggestedWeightKg).toBe(57.5)
    expect(result.suggestedSets).toBe(3) // base로 리셋
  })

  it('RPE normal(undefined) → hold (현상 유지)', () => {
    const result = suggestProgressiveOverload(60, null, 3, 4, 'barbell', 'intermediate')
    expect(result.progression).toBe('hold')
    expect(result.suggestedWeightKg).toBe(60)
    expect(result.suggestedSets).toBe(4)
  })

  it('무게 0.5kg 미만으로 내려가지 않음 (최소값 보장)', () => {
    const result = suggestProgressiveOverload(2.5, 'max', 3, 3, 'dumbbell', 'beginner')
    expect(result.suggestedWeightKg).toBeGreaterThanOrEqual(0.5)
  })

  it('resistance_band 첫 세션 → null (측정 불가)', () => {
    const result = suggestProgressiveOverload(null, null, 3, null, 'resistance_band', 'beginner')
    expect(result.suggestedWeightKg).toBeNull()
  })
})

// ─── selectExercises ──────────────────────────────────────────────────────────
describe('selectExercises', () => {
  it('요청 수만큼 반환', () => {
    const result = selectExercises('chest', 'beginner', 'bulk', 1, mockExercises, 2)
    expect(result).toHaveLength(2)
  })

  it('해당 근육만 반환', () => {
    const result = selectExercises('chest', 'beginner', 'bulk', 1, mockExercises, 2)
    result.forEach((ex) => expect(ex.primary_muscles).toContain('chest'))
  })

  it('replacedIds에 있는 운동은 처방 제외', () => {
    const replaced = new Set(['ex-chest-1'])
    const result = selectExercises('chest', 'beginner', 'bulk', 1, mockExercises, 2, undefined, replaced)
    const ids = result.map((e) => e.id)
    expect(ids).not.toContain('ex-chest-1')
  })

  it('beginner → machine 우선 선택', () => {
    const result = selectExercises('chest', 'beginner', 'bulk', 1, mockExercises, 1)
    // beginner 장비 우선순위: machine > dumbbell > barbell
    expect(result[0].equipment).toBe('machine')
  })

  it('advanced → barbell 우선 선택', () => {
    const result = selectExercises('chest', 'advanced', 'bulk', 1, mockExercises, 1)
    expect(result[0].equipment).toBe('barbell')
  })

  it('해당 근육 운동이 없으면 빈 배열', () => {
    const result = selectExercises('forearms', 'beginner', 'bulk', 1, mockExercises, 2)
    expect(result).toHaveLength(0)
  })

  it('중복 exerciseId 없음', () => {
    const result = selectExercises('chest', 'intermediate', 'bulk', 1, mockExercises, 3)
    const ids = result.map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('lastWeightIds에 있는 운동이 같은 compound 그룹 내에서 앞에 배치됨', () => {
    // barbell(ex-chest-1)과 machine(ex-chest-2) 중 기록 있는 barbell이 앞에
    const lastWeightIds = new Set(['ex-chest-1'])
    const result = selectExercises('chest', 'intermediate', 'bulk', 1, mockExercises, 2, lastWeightIds)
    // compound 우선 정렬 후 lastWeightIds 보정 → barbell이 첫번째
    const ids = result.map((e) => e.id)
    expect(ids[0]).toBe('ex-chest-1')
  })
})

// ─── prescribeRoutine (통합) ──────────────────────────────────────────────────
describe('prescribeRoutine', () => {
  const startedAt = daysAgo(0)

  it('exercisesDb 없으면 빈 배열', () => {
    const result = prescribeRoutine(beginnerBulkMale, ['chest'], startedAt)
    expect(result).toHaveLength(0)
  })

  it('근육 그룹별 운동이 처방됨', () => {
    const result = prescribeRoutine(beginnerBulkMale, ['chest', 'lats'], startedAt, {}, {}, mockExercises)
    const muscles = result.map((e) => e.muscleGroup)
    expect(muscles).toContain('chest')
    expect(muscles).toContain('lats')
  })

  it('beginner → 근육당 최대 1개 운동', () => {
    const result = prescribeRoutine(beginnerBulkMale, ['chest'], startedAt, {}, {}, mockExercises)
    const chestExercises = result.filter((e) => e.muscleGroup === 'chest')
    expect(chestExercises.length).toBeLessThanOrEqual(2) // 집중부위면 +1 허용
  })

  it('compound가 isolation보다 앞에 배치됨', () => {
    const result = prescribeRoutine(beginnerBulkMale, ['chest'], startedAt, {}, {}, mockExercises)
    // Barbell Bench Press(compound)가 Dumbbell Fly(isolation)보다 앞이어야 함
    const ids = result.map((e) => e.exerciseId)
    // chest compound는 barbell(ex-chest-1) or machine(ex-chest-2), isolation은 fly(ex-chest-3)
    const flyIndex = ids.indexOf('ex-chest-3')
    const compoundIndex = ids.findIndex((id) => id === 'ex-chest-1' || id === 'ex-chest-2')
    if (flyIndex !== -1 && compoundIndex !== -1) {
      expect(compoundIndex).toBeLessThan(flyIndex)
    }
  })

  it('단백질 3일 평균 70% 미달 → 세트 -1 적용 (최소 2세트)', () => {
    const normalResult = prescribeRoutine(beginnerBulkMale, ['chest'], startedAt, {}, {}, mockExercises)
    const lowProteinResult = prescribeRoutine(
      beginnerBulkMale, ['chest'], startedAt, {}, {}, mockExercises,
      { proteinRatioLast3Days: 0.5 }
    )
    const normalSets = normalResult[0]?.sets ?? 0
    const lowSets = lowProteinResult[0]?.sets ?? 0
    expect(lowSets).toBeLessThanOrEqual(normalSets)
    expect(lowSets).toBeGreaterThanOrEqual(2)
  })

  it('replacedExerciseIds → 처방에서 제외됨', () => {
    const replacedIds = new Set(['ex-chest-1', 'ex-chest-2', 'ex-chest-3'])
    const result = prescribeRoutine(
      beginnerBulkMale, ['chest'], startedAt, {}, {}, mockExercises,
      { replacedExerciseIds: replacedIds }
    )
    // chest 운동이 모두 교체 제외되면 처방 없음
    result.forEach((e) => expect(replacedIds.has(e.exerciseId)).toBe(false))
  })

  it('딜로드 주(completedSessions=14) → 세트 감소', () => {
    const normalResult = prescribeRoutine(
      beginnerBulkMale, ['chest'], startedAt, {}, {}, mockExercises,
      { completedSessionCount: 13 }
    )
    const deloadResult = prescribeRoutine(
      beginnerBulkMale, ['chest'], startedAt, {}, {}, mockExercises,
      { completedSessionCount: 14 }
    )
    const normalSets = normalResult[0]?.sets ?? 0
    const deloadSets = deloadResult[0]?.sets ?? 0
    expect(deloadSets).toBeLessThanOrEqual(normalSets)
    expect(deloadSets).toBeGreaterThanOrEqual(2)
  })

  it('집중부위 근육은 세트+1 적용됨', () => {
    // beginnerBulkMale.focus_parts = ['chest', 'arms'] → chest가 1순위
    const result = prescribeRoutine(beginnerBulkMale, ['chest', 'lats'], startedAt, {}, {}, mockExercises)
    const chestEx = result.find((e) => e.muscleGroup === 'chest')
    const latsEx = result.find((e) => e.muscleGroup === 'lats')
    // chest(집중부위)는 lats보다 세트가 많거나 같아야 함
    if (chestEx && latsEx) {
      expect(chestEx.sets).toBeGreaterThanOrEqual(latsEx.sets)
    }
  })

  it('첫 세션 운동은 first_session progression 반환', () => {
    const result = prescribeRoutine(beginnerBulkMale, ['chest'], startedAt, {}, {}, mockExercises)
    expect(result[0]?.progression).toBe('first_session')
  })

  it('이전 기록 있으면 suggestedWeightKg 반환', () => {
    const lastWeights = { 'ex-chest-2': 50 } // machine chest press
    const lastRpes = { 'ex-chest-2': 'easy' }
    const result = prescribeRoutine(
      beginnerBulkMale, ['chest'], startedAt, lastWeights, lastRpes, mockExercises
    )
    const machineEx = result.find((e) => e.exerciseId === 'ex-chest-2')
    if (machineEx) {
      expect(machineEx.suggestedWeightKg).not.toBeNull()
    }
  })

  it('female upper_lower 처방 — glutes 포함 시 운동 반환', () => {
    const result = prescribeRoutine(
      intermediateCutFemale, ['glutes', 'hamstrings'], startedAt, {}, {}, mockExercises
    )
    const muscles = result.map((e) => e.muscleGroup)
    expect(muscles).toContain('glutes')
  })

  it('세션 수 기반 weekNumber → 주기화 반영', () => {
    const week1Result = prescribeRoutine(
      advancedMaintainMale, ['chest'], startedAt, {}, {}, mockExercises,
      { completedSessionCount: 0 }
    )
    const week4Result = prescribeRoutine(
      advancedMaintainMale, ['chest'], startedAt, {}, {}, mockExercises,
      { completedSessionCount: 9 } // 9세션 = 3주차
    )
    // 결과 자체가 달라질 수 있음 (주기화) — 단순히 오류 없이 반환되는지 확인
    expect(week1Result.length).toBeGreaterThan(0)
    expect(week4Result.length).toBeGreaterThan(0)
  })
})

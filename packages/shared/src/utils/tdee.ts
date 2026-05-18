import type { BodyInfo } from '../types/user'

/**
 * Harris-Benedict 공식으로 BMR 계산
 */
export function calculateBMR(info: BodyInfo): number {
  if (info.gender === 'male') {
    return 88.362 + 13.397 * info.weight + 4.799 * info.height - 5.677 * info.age
  }
  return 447.593 + 9.247 * info.weight + 3.098 * info.height - 4.330 * info.age
}

const activityMultipliers = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
}

/**
 * TDEE (총 일일 에너지 소모량) 계산
 */
export function calculateTDEE(info: BodyInfo): number {
  return Math.round(calculateBMR(info) * activityMultipliers[info.activity_level])
}

/**
 * 목표에 따른 일일 칼로리 목표 계산
 *
 * lose_weight: target_weight/target_days 역산 방식
 *   - 수분감소 1.5kg 제외한 실제 지방 감량분을 칼로리 적자로 역산
 *   - 운동으로 400~500 kcal 분담, 나머지를 식단 적자로
 *   - 마지노선: 여성 1,200 / 남성 1,500 kcal
 */
export function calculateCalorieGoal(info: BodyInfo): number {
  const tdee = calculateTDEE(info)

  if (info.goal === 'lose_weight' && info.target_weight != null && info.target_days != null && info.target_days > 0) {
    const totalLoss = info.weight - info.target_weight
    const fatLoss = Math.max(totalLoss - 1.5, 0)   // 수분 1.5kg 제외
    const dailyDeficit = (fatLoss * 7700) / info.target_days

    // 운동으로 담당할 몫: 최대 500 kcal/일로 클램프
    const exerciseContribution = Math.min(dailyDeficit * 0.4, 500)
    const dietDeficit = dailyDeficit - exerciseContribution

    const floor = info.gender === 'female' ? 1200 : 1500
    return Math.max(Math.round(tdee - dietDeficit), floor)
  }

  switch (info.goal) {
    case 'lose_weight':
      return Math.round(tdee * 0.8)
    case 'gain_muscle':
      return Math.round(tdee * 1.1)
    case 'maintain':
    default:
      return tdee
  }
}

/**
 * 목표 칼로리에서 탄단지 비율 계산
 */
export function calculateMacroGoals(calorieGoal: number, goal: BodyInfo['goal']) {
  let proteinRatio: number
  let fatRatio: number
  let carbRatio: number

  switch (goal) {
    case 'lose_weight':
      proteinRatio = 0.35
      fatRatio = 0.30
      carbRatio = 0.35
      break
    case 'gain_muscle':
      proteinRatio = 0.30
      fatRatio = 0.25
      carbRatio = 0.45
      break
    default:
      proteinRatio = 0.25
      fatRatio = 0.30
      carbRatio = 0.45
  }

  return {
    calories: calorieGoal,
    protein: Math.round((calorieGoal * proteinRatio) / 4),   // 1g = 4kcal
    fat: Math.round((calorieGoal * fatRatio) / 9),           // 1g = 9kcal
    carbs: Math.round((calorieGoal * carbRatio) / 4),        // 1g = 4kcal
  }
}

export function calculateBMI(weight: number, height: number): number {
  const heightM = height / 100
  return Math.round((weight / (heightM * heightM)) * 10) / 10
}

export function getBMICategory(bmi: number): string {
  if (bmi < 18.5) return '저체중'
  if (bmi < 23) return '정상'
  if (bmi < 25) return '과체중'
  if (bmi < 30) return '비만'
  return '고도비만'
}

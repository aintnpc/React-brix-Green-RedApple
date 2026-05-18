export type Gender = 'male' | 'female'
export type Goal = 'lose_weight' | 'maintain' | 'gain_muscle'
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active'

export interface UserProfile {
  id: string
  email: string
  name: string
  nickname?: string
  avatar_url?: string
  created_at: string
}

export interface BodyInfo {
  user_id: string
  height: number          // cm
  weight: number          // kg
  age: number
  gender: Gender
  goal: Goal
  activity_level: ActivityLevel
  target_weight?: number          // kg
  target_days?: number            // 목표 달성까지 기간 (일)
  exercise_minutes_per_day?: number  // 하루 운동 가능 시간 (분)
  focus_parts?: string[]          // 집중 부위 (최대 2개)
}

export interface AuthSession {
  access_token: string
  refresh_token: string
  user: UserProfile
}

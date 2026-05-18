export type MuscleGroup =
  | 'chest' | 'back' | 'shoulders' | 'biceps' | 'triceps' | 'forearms'
  | 'abs' | 'obliques' | 'glutes' | 'quads' | 'hamstrings' | 'calves'
  | 'traps' | 'lats' | 'lower_back'

export type ExerciseCategory = 'cardio' | 'strength' | 'flexibility'
export type ExerciseEquipment = 'none' | 'barbell' | 'dumbbell' | 'machine' | 'cable' | 'kettlebell' | 'resistance_band'
export type DifficultyLevel = 'beginner' | 'intermediate' | 'advanced'

export interface Exercise {
  id: string
  name: string
  name_ko: string
  category: ExerciseCategory
  equipment: ExerciseEquipment
  difficulty: DifficultyLevel
  primary_muscles: MuscleGroup[]
  secondary_muscles: MuscleGroup[]
  instructions: string[]
  image_url?: string
  gif_url?: string
  source_url?: string   // weighttraining.guide 원본
}

export interface RouteCoord {
  latitude: number
  longitude: number
  timestamp?: number
}

export interface ExerciseLog {
  id: string
  user_id: string
  date: string          // YYYY-MM-DD
  exercise: Exercise
  sets?: ExerciseSet[]
  duration_minutes?: number   // 유산소
  distance_km?: number        // 런닝/자전거
  calories_burned?: number
  amount?: number             // 운동량 (줄넘기: 회, 계단: 층)
  route?: RouteCoord[]        // GPS 경로
  created_at: string
}

export type RPE = 'easy' | 'moderate' | 'hard' | 'max'

export interface ExerciseSet {
  set_number: number
  reps?: number
  weight_kg?: number
  duration_seconds?: number
  rpe?: RPE
}

// 루틴 (gym-app)
export interface Routine {
  id: string
  user_id: string
  name: string
  exercises: RoutineExercise[]
  created_at: string
}

export interface RoutineExercise {
  exercise: Exercise
  sets: number
  reps?: number
  weight_kg?: number
  order: number
}

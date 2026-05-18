import type { BuildBodyInfo } from '../../utils/planBodybuilding'

export const beginnerBulkMale: BuildBodyInfo = {
  user_id: 'test-user-1',
  height: 175,
  weight: 70,
  age: 25,
  gender: 'male',
  goal: 'gain_muscle',
  activity_level: 'moderate',
  build_goal: 'bulk',
  training_days_per_week: 3,
  split_type: 'full_body',
  experience_level: 'beginner',
  focus_parts: ['chest', 'arms'],
}

export const intermediateCutFemale: BuildBodyInfo = {
  user_id: 'test-user-2',
  height: 163,
  weight: 58,
  age: 28,
  gender: 'female',
  goal: 'lose_weight',
  activity_level: 'light',
  build_goal: 'cut',
  training_days_per_week: 4,
  split_type: 'upper_lower',
  experience_level: 'intermediate',
  focus_parts: ['glutes', 'legs'],
}

export const advancedMaintainMale: BuildBodyInfo = {
  user_id: 'test-user-3',
  height: 180,
  weight: 85,
  age: 30,
  gender: 'male',
  goal: 'maintain',
  activity_level: 'active',
  build_goal: 'maintain',
  training_days_per_week: 6,
  split_type: 'push_pull_legs',
  experience_level: 'advanced',
  focus_parts: [],
}

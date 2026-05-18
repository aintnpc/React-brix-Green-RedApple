// 실제 exercises.json 구조를 미니멀하게 재현한 mock
// primary_muscles 기준으로 13개 근육을 고르게 커버

export const mockExercises = [
  // chest — compound + isolation
  { id: 'ex-chest-1', name: 'Barbell Bench Press', primary_muscles: ['chest'], equipment: 'barbell' },
  { id: 'ex-chest-2', name: 'Machine Chest Press', primary_muscles: ['chest'], equipment: 'machine' },
  { id: 'ex-chest-3', name: 'Dumbbell Fly', primary_muscles: ['chest'], equipment: 'dumbbell' },

  // lats
  { id: 'ex-lats-1', name: 'Barbell Row', primary_muscles: ['lats'], equipment: 'barbell' },
  { id: 'ex-lats-2', name: 'Pull-up', primary_muscles: ['lats'], equipment: 'none' },
  { id: 'ex-lats-3', name: 'Cable Pulldown', primary_muscles: ['lats'], equipment: 'cable' },

  // shoulders
  { id: 'ex-sh-1', name: 'Barbell Overhead Press', primary_muscles: ['shoulders'], equipment: 'barbell' },
  { id: 'ex-sh-2', name: 'Dumbbell Lateral Raise', primary_muscles: ['shoulders'], equipment: 'dumbbell' },

  // triceps
  { id: 'ex-tri-1', name: 'Cable Tricep Pushdown', primary_muscles: ['triceps'], equipment: 'cable' },
  { id: 'ex-tri-2', name: 'Dumbbell Overhead Tricep Extension', primary_muscles: ['triceps'], equipment: 'dumbbell' },

  // biceps
  { id: 'ex-bi-1', name: 'Barbell Curl', primary_muscles: ['biceps'], equipment: 'barbell' },
  { id: 'ex-bi-2', name: 'Dumbbell Curl', primary_muscles: ['biceps'], equipment: 'dumbbell' },

  // quads
  { id: 'ex-quad-1', name: 'Barbell Squat', primary_muscles: ['quads'], equipment: 'barbell' },
  { id: 'ex-quad-2', name: 'Machine Leg Press', primary_muscles: ['quads'], equipment: 'machine' },
  { id: 'ex-quad-3', name: 'Dumbbell Lunge', primary_muscles: ['quads'], equipment: 'dumbbell' },

  // hamstrings
  { id: 'ex-ham-1', name: 'Romanian Deadlift', primary_muscles: ['hamstrings'], equipment: 'barbell' },
  { id: 'ex-ham-2', name: 'Machine Leg Curl', primary_muscles: ['hamstrings'], equipment: 'machine' },

  // glutes
  { id: 'ex-glu-1', name: 'Barbell Hip Thrust', primary_muscles: ['glutes'], equipment: 'barbell' },
  { id: 'ex-glu-2', name: 'Cable Kickback', primary_muscles: ['glutes'], equipment: 'cable' },

  // calves
  { id: 'ex-cal-1', name: 'Machine Calf Raise', primary_muscles: ['calves'], equipment: 'machine' },
  { id: 'ex-cal-2', name: 'Dumbbell Calf Raise', primary_muscles: ['calves'], equipment: 'dumbbell' },

  // abs
  { id: 'ex-abs-1', name: 'Cable Crunch', primary_muscles: ['abs'], equipment: 'cable' },
  { id: 'ex-abs-2', name: 'Plank', primary_muscles: ['abs'], equipment: 'none' },

  // traps
  { id: 'ex-trap-1', name: 'Barbell Shrug', primary_muscles: ['traps'], equipment: 'barbell' },
  { id: 'ex-trap-2', name: 'Dumbbell Shrug', primary_muscles: ['traps'], equipment: 'dumbbell' },

  // lower_back
  { id: 'ex-lb-1', name: 'Barbell Deadlift', primary_muscles: ['lower_back'], equipment: 'barbell' },
  { id: 'ex-lb-2', name: 'Back Extension', primary_muscles: ['lower_back'], equipment: 'none' },
]

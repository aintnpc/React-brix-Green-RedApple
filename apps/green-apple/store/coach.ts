import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from '../lib/supabase'
import { calculateTodayGoals, type TodayGoals } from '@repo/shared'
import type { BodyInfo } from '@repo/shared'
import { getStepsByDateRange, stepsToKcal } from '../lib/health'

interface CoachState {
  goals: TodayGoals | null
  loading: boolean
  pastMealKcalByDate: Record<string, number>
  pastExerciseKcalByDate: Record<string, number>

  fetchPastLogs: (userId: string, bodyInfo: BodyInfo, programStartedAt: string) => Promise<void>
  recalculate: (bodyInfo: BodyInfo, programStartedAt: string, todayConsumed: number, todayBurned: number, currentWeight?: number) => void
}

function getTodayString() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const useCoachStore = create<CoachState>()(
  persist(
    (set, get) => ({
      goals: null,
      loading: false,
      pastMealKcalByDate: {},
      pastExerciseKcalByDate: {},

      fetchPastLogs: async (userId, bodyInfo, programStartedAt) => {
        set({ loading: true })
        const today = getTodayString()
        const startDate = programStartedAt.slice(0, 10)

        const yesterday = (() => {
          const d = new Date()
          d.setDate(d.getDate() - 1)
          return d.toISOString().slice(0, 10)
        })()

        const [mealRes, exRes, stepsByDate] = await Promise.all([
          supabase
            .from('meal_logs')
            .select('date, total_nutrition')
            .eq('user_id', userId)
            .lt('date', today)
            .gte('date', startDate),
          supabase
            .from('exercise_logs')
            .select('date, calories_burned')
            .eq('user_id', userId)
            .lt('date', today)
            .gte('date', startDate),
          getStepsByDateRange(startDate, yesterday),
        ])

        const pastMealKcalByDate: Record<string, number> = {}
        for (const row of mealRes.data ?? []) {
          const kcal = row.total_nutrition?.calories ?? 0
          pastMealKcalByDate[row.date] = (pastMealKcalByDate[row.date] ?? 0) + kcal
        }

        // 운동 기록 + 걸음 수 kcal 합산
        const pastExerciseKcalByDate: Record<string, number> = {}
        for (const row of exRes.data ?? []) {
          const kcal = row.calories_burned ?? 0
          pastExerciseKcalByDate[row.date] = (pastExerciseKcalByDate[row.date] ?? 0) + kcal
        }
        for (const [date, steps] of Object.entries(stepsByDate)) {
          const kcal = stepsToKcal(steps, bodyInfo.weight)
          pastExerciseKcalByDate[date] = (pastExerciseKcalByDate[date] ?? 0) + kcal
        }

        set({ pastMealKcalByDate, pastExerciseKcalByDate, loading: false })
      },

      recalculate: (bodyInfo, programStartedAt, todayConsumed, todayBurned, currentWeight) => {
        const { pastMealKcalByDate, pastExerciseKcalByDate } = get()
        const goals = calculateTodayGoals(bodyInfo, programStartedAt, pastMealKcalByDate, pastExerciseKcalByDate, todayConsumed, todayBurned, currentWeight)
        set({ goals })
      },
    }),
    {
      name: 'coach-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        goals: state.goals,
        pastMealKcalByDate: state.pastMealKcalByDate,
        pastExerciseKcalByDate: state.pastExerciseKcalByDate,
      }),
    }
  )
)

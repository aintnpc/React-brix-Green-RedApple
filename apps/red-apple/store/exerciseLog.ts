import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { ExerciseLog } from '@repo/shared'
import { supabase } from '../lib/supabase'

interface ExerciseLogState {
  logs: ExerciseLog[]
  getTodayBurned: (date: string) => number
  getTodayLogs: (date: string) => ExerciseLog[]
  getLastSetForExercise: (exerciseId: string) => { weight_kg?: number; reps?: number } | null
  addLog: (log: ExerciseLog) => Promise<void>
  clearAll: () => void
  seedDummy: (logs: ExerciseLog[]) => void
  syncFromDB: (userId: string) => Promise<void>
}

export const useExerciseLogStore = create<ExerciseLogState>()(
  persist(
    (set, get) => ({
      logs: [],

      getTodayLogs: (date) => get().logs.filter((l) => l.date === date),

      getLastSetForExercise: (exerciseId) => {
        const matching = get().logs
          .filter((l) => l.exercise.id === exerciseId && l.sets && l.sets.length > 0)
          .sort((a, b) => (a.created_at > b.created_at ? -1 : 1))
        if (matching.length === 0) return null
        const lastSets = matching[0].sets!
        return lastSets[lastSets.length - 1]
      },

      getTodayBurned: (date) =>
        get()
          .logs.filter((l) => l.date === date)
          .reduce((sum, l) => sum + (l.calories_burned ?? 0), 0),

      addLog: async (log) => {
        set((state) => ({ logs: [...state.logs, log] }))
        const { error } = await supabase.from('exercise_logs').insert({
          id: log.id,
          user_id: log.user_id,
          date: log.date,
          exercise: log.exercise,
          sets: log.sets ?? null,
          duration_minutes: log.duration_minutes,
          calories_burned: log.calories_burned,
          amount: log.amount,
          route: log.route,
          created_at: log.created_at,
        })
        if (error) console.error('[addLog] DB error:', error)
      },

      clearAll: () => set({ logs: [] }),
      seedDummy: (logs) => set({ logs }),

      syncFromDB: async (userId) => {
        const { data, error } = await supabase
          .from('exercise_logs')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: true })
        if (error) { console.error('[syncFromDB] exercise_logs error:', error); return }
        const logs: ExerciseLog[] = (data ?? []).map((r: any) => ({
          id: r.id,
          user_id: r.user_id,
          date: r.date,
          exercise: r.exercise,
          sets: r.sets ?? undefined,
          duration_minutes: r.duration_minutes,
          calories_burned: r.calories_burned,
          amount: r.amount,
          route: r.route,
          created_at: r.created_at,
        }))
        set({ logs })
      },
    }),
    {
      name: 'exercise-log-storage',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
)

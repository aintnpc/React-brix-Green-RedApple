import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { ExerciseLog } from '@repo/shared'
import { supabase } from '../lib/supabase'

interface ExerciseLogState {
  logs: ExerciseLog[]
  getTodayBurned: (date: string) => number
  getTodayLogs: (date: string) => ExerciseLog[]
  addLog: (log: ExerciseLog) => Promise<void>
  clearAll: () => void
  syncFromDB: (userId: string) => Promise<void>
}

export const useExerciseLogStore = create<ExerciseLogState>()(
  persist(
    (set, get) => ({
      logs: [],

      getTodayLogs: (date) => get().logs.filter((l) => l.date === date),

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
          duration_minutes: log.duration_minutes,
          calories_burned: log.calories_burned,
          amount: log.amount,
          route: log.route,
          created_at: log.created_at,
        })
        if (error) {
          console.error('[addLog] DB error:', error)
          throw error
        }
      },

      clearAll: () => set({ logs: [] }),

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
      name: 'exercise-storage',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
)

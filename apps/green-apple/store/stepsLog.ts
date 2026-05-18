import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from '../lib/supabase'

export interface StepsEntry {
  date: string  // YYYY-MM-DD
  steps: number
}

interface StepsLogState {
  entries: StepsEntry[]
  lastSavedDate: string | null  // 마지막으로 저장한 날짜 (중복 방지)

  getEntry: (date: string) => StepsEntry | null
  saveSteps: (userId: string, date: string, steps: number) => Promise<void>
  syncFromDB: (userId: string, startDate: string) => Promise<void>
}

export const useStepsLogStore = create<StepsLogState>()(
  persist(
    (set, get) => ({
      entries: [],
      lastSavedDate: null,

      getEntry: (date) => get().entries.find((e) => e.date === date) ?? null,

      saveSteps: async (userId, date, steps) => {
        // 로컬 업데이트
        set((state) => {
          const rest = state.entries.filter((e) => e.date !== date)
          return {
            entries: [...rest, { date, steps }].sort((a, b) => a.date.localeCompare(b.date)),
            lastSavedDate: date,
          }
        })
        // DB upsert
        await supabase.from('daily_steps').upsert(
          { user_id: userId, date, steps, updated_at: new Date().toISOString() },
          { onConflict: 'user_id,date' }
        )
      },

      syncFromDB: async (userId, startDate) => {
        const { data } = await supabase
          .from('daily_steps')
          .select('date, steps')
          .eq('user_id', userId)
          .gte('date', startDate)
          .order('date')
        if (data) {
          set({ entries: data.map((r) => ({ date: r.date, steps: r.steps })) })
        }
      },
    }),
    {
      name: 'steps-log-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        entries: state.entries,
        lastSavedDate: state.lastSavedDate,
      }),
    }
  )
)

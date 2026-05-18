import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from '../lib/supabase'

export interface WeightEntry {
  date: string
  weight: number
}

interface WeightLogState {
  entries: WeightEntry[]
  startDate: string | null

  addEntry: (entry: WeightEntry) => Promise<void>
  getLatest: () => WeightEntry | null
  getEntry: (date: string) => WeightEntry | null
  getProgramDay: (date: string) => number
  isMeasureDay: (date: string) => boolean
  shouldPromptToday: (today: string) => boolean
  seedDummy: (entries: WeightEntry[], startDate: string) => void
  syncFromDB: (userId: string) => Promise<void>
}

export const useWeightLogStore = create<WeightLogState>()(
  persist(
    (set, get) => ({
      entries: [],
      startDate: null,

      addEntry: async (entry) => {
        set((state) => {
          const start = state.startDate ?? entry.date
          const rest = state.entries.filter((e) => e.date !== entry.date)
          return {
            entries: [...rest, entry].sort((a, b) => a.date.localeCompare(b.date)),
            startDate: start,
          }
        })
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        const { error } = await supabase.from('weight_logs').upsert({
          user_id: user.id,
          date: entry.date,
          weight: entry.weight,
        }, { onConflict: 'user_id,date' })
        if (error) console.error('[addEntry] DB error:', error)
      },

      getLatest: () => {
        const { entries } = get()
        return entries.length ? entries[entries.length - 1] : null
      },

      getEntry: (date) => get().entries.find((e) => e.date === date) ?? null,

      getProgramDay: (date) => {
        const { startDate } = get()
        if (!startDate) return 1
        const diff = Math.floor(
          (new Date(date).getTime() - new Date(startDate).getTime()) / 86_400_000
        )
        return Math.max(1, diff + 1)
      },

      isMeasureDay: (date) => {
        const day = get().getProgramDay(date)
        return (day - 1) % 3 === 0
      },

      shouldPromptToday: (today) => {
        const { startDate, getProgramDay, entries } = get()
        if (!startDate) return true

        const programDay = getProgramDay(today)
        const lastMeasureDayNum = programDay - ((programDay - 1) % 3)
        const start = new Date(startDate)
        const measureDate = new Date(start)
        measureDate.setDate(start.getDate() + lastMeasureDayNum - 1)
        const measureDateStr = measureDate.toISOString().slice(0, 10)

        return !entries.some((e) => e.date === measureDateStr)
      },

      seedDummy: (entries, startDate) => set({ entries, startDate }),

      syncFromDB: async (userId) => {
        const { data, error } = await supabase
          .from('weight_logs')
          .select('date, weight')
          .eq('user_id', userId)
          .order('date', { ascending: true })
        if (error) { console.error('[syncFromDB] weight_logs error:', error); return }
        const entries: WeightEntry[] = (data ?? []).map((r: any) => ({
          date: r.date,
          weight: Number(r.weight),
        }))
        set((state) => ({
          entries,
          startDate: entries.length > 0 ? entries[0].date : state.startDate,
        }))
      },
    }),
    {
      name: 'weight-storage',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
)

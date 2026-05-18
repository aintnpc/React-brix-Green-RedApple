import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { MealLog } from '@repo/shared'
import { supabase } from '../lib/supabase'

interface DietState {
  logs: MealLog[]
  getTodayLogs: (date: string) => MealLog[]
  addMealLog: (log: MealLog) => Promise<void>
  removeMealLog: (id: string) => Promise<void>
  updateMealLog: (id: string, patch: Partial<MealLog>) => Promise<void>
  clearAll: () => void
  syncFromDB: (userId: string) => Promise<void>
}

export const useDietStore = create<DietState>()(
  persist(
    (set, get) => ({
      logs: [],

      getTodayLogs: (date: string) =>
        get().logs.filter((log) => log.date === date),

      addMealLog: async (log) => {
        set((state) => ({ logs: [...state.logs, log] }))
        const { error } = await supabase.from('meal_logs').insert({
          id: log.id,
          user_id: log.user_id,
          date: log.date,
          meal_type: log.meal_type,
          foods: log.foods,
          total_nutrition: log.total_nutrition,
          total_calories: log.total_nutrition.calories,
          total_carbs: log.total_nutrition.carbs,
          total_protein: log.total_nutrition.protein,
          total_fat: log.total_nutrition.fat,
          image_url: log.image_url ?? null,
          input_text: log.input_text ?? null,
          created_at: log.created_at,
        })
        if (error) {
          console.error('[addMealLog] DB error:', error)
          throw error
        }
      },

      removeMealLog: async (id) => {
        set((state) => ({ logs: state.logs.filter((l) => l.id !== id) }))
        const { error } = await supabase.from('meal_logs').delete().eq('id', id)
        if (error) console.error('[removeMealLog] DB error:', error)
      },

      updateMealLog: async (id, patch) => {
        set((state) => ({
          logs: state.logs.map((l) => l.id === id ? { ...l, ...patch } : l),
        }))
        const dbPatch: Record<string, unknown> = {}
        if (patch.ai_comment !== undefined) dbPatch.ai_comment = patch.ai_comment
        if (patch.input_text !== undefined) dbPatch.input_text = patch.input_text
        if (patch.foods !== undefined) dbPatch.foods = patch.foods
        if (patch.total_nutrition !== undefined) {
          dbPatch.total_nutrition = patch.total_nutrition
          dbPatch.total_calories  = patch.total_nutrition.calories
          dbPatch.total_carbs     = patch.total_nutrition.carbs
          dbPatch.total_protein   = patch.total_nutrition.protein
          dbPatch.total_fat       = patch.total_nutrition.fat
        }
        if (Object.keys(dbPatch).length > 0) {
          const { error } = await supabase.from('meal_logs').update(dbPatch).eq('id', id)
          if (error) console.error('[updateMealLog] DB error:', error)
        }
      },

      clearAll: () => set({ logs: [] }),

      syncFromDB: async (userId) => {
        const { data, error } = await supabase
          .from('meal_logs')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: true })
        if (error) { console.error('[syncFromDB] meal_logs error:', error); return }
        const logs: MealLog[] = (data ?? []).map((r: any) => ({
          id: r.id,
          user_id: r.user_id,
          date: r.date,
          meal_type: r.meal_type,
          foods: r.foods ?? [],
          total_nutrition: r.total_nutrition ?? {
            calories: r.total_calories ?? 0,
            carbs: r.total_carbs ?? 0,
            protein: r.total_protein ?? 0,
            fat: r.total_fat ?? 0,
          },
          image_url: r.image_url ?? undefined,
          input_text: r.input_text ?? undefined,
          ai_comment: r.ai_comment ?? undefined,
          created_at: r.created_at,
        }))
        set({ logs })
      },
    }),
    {
      name: 'diet-storage',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
)

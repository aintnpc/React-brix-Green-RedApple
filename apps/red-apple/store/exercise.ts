import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { Exercise, MuscleGroup, Routine } from '@repo/shared'
import { EXERCISES } from '../data/exercises'

const SAMPLE_EXERCISES: Exercise[] = EXERCISES

interface ExerciseState {
  exercises: Exercise[]
  cart: Exercise[]
  routines: Routine[]
  favoriteIds: Set<string>
  // 사용자가 처방에서 교체한 운동 ID — 이후 자동 처방에서 제외됨
  replacedExerciseIds: Set<string>

  getExercisesByMuscle: (muscle: MuscleGroup) => Exercise[]
  addToCart: (exercise: Exercise) => void
  removeFromCart: (id: string) => void
  clearCart: () => void
  saveRoutine: () => void
  toggleFavorite: (id: string) => void
  isFavorite: (id: string) => boolean
  recordReplaced: (originalId: string) => void
  clearReplaced: () => void
}

export const useExerciseStore = create<ExerciseState>()(
  persist(
    (set, get) => ({
      exercises: SAMPLE_EXERCISES,
      cart: [],
      routines: [],
      favoriteIds: new Set(),
      replacedExerciseIds: new Set(),

      getExercisesByMuscle: (muscle) =>
        get().exercises.filter(
          (ex) =>
            ex.primary_muscles.includes(muscle) ||
            ex.secondary_muscles.includes(muscle)
        ),

      addToCart: (exercise) =>
        set((state) => {
          if (state.cart.some((c) => c.id === exercise.id)) return state
          return { cart: [...state.cart, exercise] }
        }),

      removeFromCart: (id) =>
        set((state) => ({ cart: state.cart.filter((c) => c.id !== id) })),

      clearCart: () => set({ cart: [] }),

      saveRoutine: () => {
        const { cart } = get()
        if (cart.length === 0) return
        const routine: Routine = {
          id: Date.now().toString(),
          user_id: '1',
          name: `루틴 ${new Date().toLocaleDateString('ko-KR')}`,
          exercises: cart.map((ex, i) => ({
            exercise: ex,
            sets: 3,
            reps: 10,
            order: i,
          })),
          created_at: new Date().toISOString(),
        }
        set((state) => ({
          routines: [...state.routines, routine],
          cart: [],
        }))
      },

      toggleFavorite: (id) =>
        set((state) => {
          const next = new Set(state.favoriteIds)
          next.has(id) ? next.delete(id) : next.add(id)
          return { favoriteIds: next }
        }),

      isFavorite: (id) => get().favoriteIds.has(id),

      recordReplaced: (originalId) =>
        set((state) => {
          const next = new Set(state.replacedExerciseIds)
          next.add(originalId)
          return { replacedExerciseIds: next }
        }),

      clearReplaced: () => set({ replacedExerciseIds: new Set() }),
    }),
    {
      name: 'exercise-storage',
      storage: createJSONStorage(() => AsyncStorage),
      // Set은 JSON 직렬화가 안 되므로 배열로 변환
      partialize: (state) => ({
        favoriteIds: [...state.favoriteIds],
        replacedExerciseIds: [...state.replacedExerciseIds],
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.favoriteIds = new Set(state.favoriteIds as unknown as string[])
          state.replacedExerciseIds = new Set(state.replacedExerciseIds as unknown as string[])
        }
      },
    }
  )
)

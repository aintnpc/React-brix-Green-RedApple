import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'

interface PostWorkoutCoach {
  muscles: string[]   // 오늘 운동한 근육 목록 (한국어)
  totalSets: number
  totalVolume: number // kg
}

interface UIState {
  showYesterdayReport: boolean
  lastReportDate: string | null
  postWorkoutCoach: PostWorkoutCoach | null

  triggerYesterdayReport: () => void
  dismissYesterdayReport: () => void
  checkAndTriggerDailyReport: () => boolean
  setPostWorkoutCoach: (data: PostWorkoutCoach) => void
  clearPostWorkoutCoach: () => void
}

function getTodayString() {
  return new Date().toLocaleDateString('en-CA')
}

export const useUIStore = create<UIState>()(
  persist(
    (set, get) => ({
      showYesterdayReport: false,
      lastReportDate: null,
      postWorkoutCoach: null,

      triggerYesterdayReport: () => set({ showYesterdayReport: true }),
      dismissYesterdayReport: () => set({ showYesterdayReport: false }),

      checkAndTriggerDailyReport: () => {
        const today = getTodayString()
        const { lastReportDate } = get()
        if (lastReportDate === today) return false
        set({ showYesterdayReport: true, lastReportDate: today })
        return true
      },

      setPostWorkoutCoach: (data) => set({ postWorkoutCoach: data }),
      clearPostWorkoutCoach: () => set({ postWorkoutCoach: null }),
    }),
    {
      name: 'ui-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        lastReportDate: state.lastReportDate,
        postWorkoutCoach: state.postWorkoutCoach,
      }),
    }
  )
)

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useAuthStore } from './auth'

interface UIState {
  showYesterdayReport: boolean
  lastReportDate: string | null
  triggerYesterdayReport: () => void
  dismissYesterdayReport: () => void
  checkAndTriggerDailyReport: () => boolean  // true = 트리거됨
}

function getTodayString() {
  return new Date().toLocaleDateString('en-CA')
}

export const useUIStore = create<UIState>()(
  persist(
    (set, get) => ({
      showYesterdayReport: false,
      lastReportDate: null,

      triggerYesterdayReport: () => set({ showYesterdayReport: true }),
      dismissYesterdayReport: () => set({ showYesterdayReport: false }),

      checkAndTriggerDailyReport: () => {
        const today = getTodayString()
        const { lastReportDate } = get()
        if (lastReportDate === today) return false
        // 가입 첫날은 어제 데이터가 없으므로 리포트 스킵
        const programStartedAt = useAuthStore.getState().programStartedAt
        if (programStartedAt && programStartedAt.slice(0, 10) === today) return false
        set({ showYesterdayReport: true, lastReportDate: today })
        return true
      },
    }),
    {
      name: 'ui-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ lastReportDate: state.lastReportDate }),
    }
  )
)

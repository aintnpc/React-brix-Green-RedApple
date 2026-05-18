import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'

// 포그라운드 알림 표시 설정
export function setupNotificationHandler() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  })
}

export async function requestNotificationPermission(): Promise<boolean> {
  const { status: existing } = await Notifications.getPermissionsAsync()
  if (existing === 'granted') return true
  const { status } = await Notifications.requestPermissionsAsync()
  return status === 'granted'
}

export async function getNotificationStatus(): Promise<string> {
  const { status } = await Notifications.getPermissionsAsync()
  return status
}

// ── 운동 리마인더 (매일 17:30, 오늘 운동 안 했으면 표시) ──────────────────────
const EXERCISE_REMINDER_ID = 'exercise-reminder'

export async function scheduleExerciseReminder() {
  await Notifications.cancelScheduledNotificationAsync(EXERCISE_REMINDER_ID).catch(() => {})
  await Notifications.scheduleNotificationAsync({
    identifier: EXERCISE_REMINDER_ID,
    content: {
      title: '오늘 운동했어요? 💪',
      body: '루틴 처방이 기다리고 있어요. 지금 시작해볼까요?',
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: 17,
      minute: 30,
    },
  })
}

export async function cancelExerciseReminder() {
  await Notifications.cancelScheduledNotificationAsync(EXERCISE_REMINDER_ID).catch(() => {})
}

// ── 아침 동기부여 (매일 08:00) ────────────────────────────────────────────────
export async function scheduleMorningMotivation(_daysLeft: number) {
  await Notifications.cancelScheduledNotificationAsync('morning-motivation').catch(() => {})
  await Notifications.scheduleNotificationAsync({
    identifier: 'morning-motivation',
    content: {
      title: '오늘도 성장하는 하루 🔥',
      body: '오늘 처방 루틴을 확인해보세요.',
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: 8,
      minute: 0,
    },
  })
}

// ── 전체 알림 스케줄 (온보딩/프로필에서 허용 시 일괄 등록) ──────────────────
export async function scheduleAllNotifications(_daysLeft: number) {
  await scheduleMorningMotivation(_daysLeft)
  await scheduleExerciseReminder()
}

// ── 운동 완료 즉시 알림 ────────────────────────────────────────────────────────
export async function sendExerciseCompletionSummary(opts: {
  exerciseName?: string
  burnedKcal?: number
  todayConsumedKcal?: number
  calorieGoal?: number
  todayTotalBurnedKcal?: number
  baseExerciseGoalKcal?: number
  tomorrowBaseExerciseKcal?: number
}) {
  const burned = Math.round(opts.burnedKcal ?? 0)
  await Notifications.scheduleNotificationAsync({
    content: {
      title: '운동 완료! 🎉',
      body: burned > 0
        ? `${burned}kcal 소모했어요. 단백질 보충도 잊지 마세요! 🥩`
        : '오늘 루틴 완료! 단백질 보충도 잊지 마세요! 🥩',
    },
    trigger: null, // 즉시
  })
}

// ── 스트릭 격려 ───────────────────────────────────────────────────────────────
export async function sendStreakEncouragement(streak: number) {
  if (streak < 3) return
  await Notifications.scheduleNotificationAsync({
    content: {
      title: `${streak}일 연속 운동 중! 🔥`,
      body: '대단해요! 이 기세를 유지해봐요.',
    },
    trigger: null,
  })
}

// ── 단백질 부족 넛지 ──────────────────────────────────────────────────────────
export async function sendUndereatingEncouragement(opts: {
  proteinRatio?: number
  targetProtein?: number
}) {
  const ratio = opts.proteinRatio ?? 0
  if (ratio >= 0.8) return
  const remaining = Math.round(((opts.targetProtein ?? 0) * (1 - ratio)))
  await Notifications.scheduleNotificationAsync({
    content: {
      title: '단백질이 부족해요 🥩',
      body: remaining > 0
        ? `오늘 단백질 ${remaining}g 더 챙겨야 해요!`
        : '단백질을 더 챙겨보세요!',
    },
    trigger: null,
  })
}

// ── 과식 넛지 (red-apple에선 사용 빈도 낮음, 시그니처 유지) ─────────────────
export async function sendOvereatNudge(_exceededBy: number) {}

// ── 식후 코칭 (red-apple에선 미사용, 시그니처 유지) ──────────────────────────
export async function schedulePostMealCoaching(_opts: unknown) {}

// ── 재참여 초기화 (시그니처 유지) ────────────────────────────────────────────
export async function resetReengagement() {
  await Notifications.cancelAllScheduledNotificationsAsync().catch(() => {})
}

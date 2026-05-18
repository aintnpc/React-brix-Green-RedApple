import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'

// ─── Handler setup (call once at app start) ───────────────────────────────────

export function setupNotificationHandler() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: false,
      shouldSetBadge: true,
    }),
  })
}

// ─── Permission ───────────────────────────────────────────────────────────────

export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Green Apple',
      importance: Notifications.AndroidImportance.HIGH,
    })
  }
  const { status } = await Notifications.requestPermissionsAsync()
  return status === 'granted'
}

export async function getNotificationStatus(): Promise<string> {
  const { status } = await Notifications.getPermissionsAsync()
  return status
}

// ─── Case 1: 식단 기록 리마인더 (매일 3회) ────────────────────────────────────

export async function scheduleMealReminders() {
  const reminders = [
    {
      id: 'meal-7',
      hour: 7, minute: 30,
      body: '오늘 아침 뭐 드실 건가요? 기록하면 하루 목표가 시작돼요 🌅',
    },
    {
      id: 'meal-12',
      hour: 12, minute: 30,
      body: '점심 드셨나요? 기록하면 저녁 가이드를 드릴게요 ☀️',
    },
    {
      id: 'meal-19',
      hour: 19, minute: 0,
      body: '저녁 식사 시간이에요. 오늘 식단 기록 마무리해봐요 🌙',
    },
  ]

  for (const r of reminders) {
    await Notifications.cancelScheduledNotificationAsync(r.id).catch(() => {})
    await Notifications.scheduleNotificationAsync({
      identifier: r.id,
      content: { title: 'Green Apple 🍎', body: r.body },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: r.hour,
        minute: r.minute,
      },
    })
  }
}

// ─── Case 2: 식사 기록 기반 다음 끼니 코칭 (동적 발송) ───────────────────────

export async function schedulePostMealCoaching(opts: {
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack'
  foodNames: string[]
  mealCalories: number
  remainingCalories: number
}) {
  const { mealType, foodNames, mealCalories, remainingCalories } = opts
  const food = foodNames.slice(0, 2).join(', ')
  const remaining = Math.max(0, remainingCalories)

  type CoachingTarget = { id: string; hour: number; minute: number; title: string; body: string }
  let target: CoachingTarget | null = null

  if (mealType === 'breakfast') {
    target = {
      id: 'coaching-lunch', hour: 11, minute: 30,
      title: '🥦 점심 전 코치의 한마디',
      body: mealCalories > 600
        ? `아침에 ${food} 드셨네요. 점심은 가볍게 ${remaining} kcal 이하로 드세요 🥗`
        : `아침 기록 완료! 점심까지 ${remaining} kcal 남았어요 💪`,
    }
  } else if (mealType === 'lunch') {
    target = {
      id: 'coaching-dinner', hour: 17, minute: 30,
      title: '🥦 저녁 전 코치의 한마디',
      body: mealCalories > 800
        ? `점심에 ${food} 드셨으니, 저녁은 가볍게 드세요. 남은 칼로리 ${remaining} kcal 🌙`
        : `점심 기록 완료! 저녁까지 ${remaining} kcal 남았어요 👍`,
    }
  } else if (mealType === 'dinner') {
    target = {
      id: 'coaching-night', hour: 22, minute: 0,
      title: '🥦 오늘 하루 마무리',
      body: remainingCalories < -100
        ? `오늘 ${Math.abs(remainingCalories)} kcal 초과했어요. 괜찮아요, 내일 다시 시작해봐요! 💚`
        : `오늘 하루 식단 완료! 내일도 이 페이스로 가요 🔥`,
    }
  } else {
    return
  }

  const now = new Date()
  const fireAt = new Date()
  fireAt.setHours(target.hour, target.minute, 0, 0)

  if (fireAt <= now) return

  await Notifications.cancelScheduledNotificationAsync(target.id).catch(() => {})
  await Notifications.scheduleNotificationAsync({
    identifier: target.id,
    content: { title: target.title, body: target.body },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: fireAt,
    },
  })
}

// ─── Case 3: 운동 리마인더 ────────────────────────────────────────────────────

export async function scheduleExerciseReminder() {
  await Notifications.cancelScheduledNotificationAsync('exercise-17').catch(() => {})
  await Notifications.scheduleNotificationAsync({
    identifier: 'exercise-17',
    content: {
      title: '🏃 운동할 시간이에요!',
      body: '오늘 운동 아직 안 하셨죠? 줄넘기 15분이면 250 kcal예요',
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: 17,
      minute: 30,
    },
  })
}

export async function cancelExerciseReminder() {
  await Notifications.cancelScheduledNotificationAsync('exercise-17').catch(() => {})
}

export async function sendOvereatNudge(exceededBy: number) {
  if (exceededBy < 200) return
  await Notifications.cancelScheduledNotificationAsync('overeat').catch(() => {})
  await Notifications.scheduleNotificationAsync({
    identifier: 'overeat',
    content: {
      title: '💪 운동으로 만회해볼까요?',
      body: `오늘 ${exceededBy} kcal 초과했어요. 운동 30분으로 되돌릴 수 있어요!`,
    },
    trigger: null,
  })
}

// ─── Case 2-b: 식사 후 여유 있을 때 긍정 알림 ────────────────────────────────

export async function sendUndereatingEncouragement(opts: {
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack'
  remainingCalories: number  // 양수 = 아직 여유 있음
}) {
  const { mealType, remainingCalories } = opts
  if (remainingCalories < 150) return  // 여유가 150 kcal 미만이면 발송 안 함

  const messages: Record<string, { hour: number; minute: number; body: string }> = {
    breakfast: { hour: 14, minute: 0,  body: `점심까지 ${remainingCalories} kcal 여유예요. 오늘 페이스 좋아요 🌿` },
    lunch:     { hour: 18, minute: 30, body: `저녁까지 ${remainingCalories} kcal 여유예요. 이 페이스면 목표 달성 무난해요 💚` },
    dinner:    { hour: 21, minute: 30, body: `오늘 ${remainingCalories} kcal 여유로 마무리! 내일 처방이 조금 줄어들 거예요 👍` },
    snack: null as any,
  }

  const target = messages[mealType]
  if (!target) return

  const fireAt = new Date()
  fireAt.setHours(target.hour, target.minute, 0, 0)
  if (fireAt <= new Date()) return

  await Notifications.cancelScheduledNotificationAsync('undereat-encourage').catch(() => {})
  await Notifications.scheduleNotificationAsync({
    identifier: 'undereat-encourage',
    content: { title: '🍀 잘 하고 있어요!', body: target.body },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: fireAt },
  })
}

// ─── Case 3-b: 운동 완료 후 성과 + 내일 예고 ─────────────────────────────────

export async function sendExerciseCompletionSummary(opts: {
  exerciseName: string
  burnedKcal: number
  todayConsumedKcal: number
  calorieGoal: number
  todayTotalBurnedKcal: number   // 오늘 운동으로 태운 총량 (방금 것 포함)
  baseExerciseGoalKcal: number   // 오늘 기본 처방 운동량
  tomorrowBaseExerciseKcal: number // 내일 예상 처방 (오늘 실적 반영)
}) {
  const {
    exerciseName, burnedKcal,
    todayConsumedKcal, calorieGoal,
    todayTotalBurnedKcal, baseExerciseGoalKcal,
    tomorrowBaseExerciseKcal,
  } = opts

  const goalDone = todayTotalBurnedKcal >= baseExerciseGoalKcal
  const overallDeficit = (calorieGoal - todayConsumedKcal) + todayTotalBurnedKcal
  const diff = tomorrowBaseExerciseKcal - baseExerciseGoalKcal

  let body = `${exerciseName} 완료! ${burnedKcal} kcal 소모했어요 💪\n`

  if (overallDeficit >= 0) {
    body += `오늘 목표 달성 중이에요 🎯`
  } else {
    body += `오늘 ${Math.abs(overallDeficit)} kcal 초과 상태예요`
  }

  if (!goalDone) {
    const remaining = baseExerciseGoalKcal - todayTotalBurnedKcal
    body += ` · 처방까지 ${remaining} kcal 남았어요`
  }

  if (diff > 0) {
    body += `\n내일 처방이 ${diff} kcal 늘어날 예정이에요 🔥`
  } else if (diff < 0) {
    body += `\n내일 처방이 ${Math.abs(diff)} kcal 줄어들어요 👍`
  } else {
    body += `\n내일도 오늘과 같은 페이스예요`
  }

  await Notifications.scheduleNotificationAsync({
    identifier: 'exercise-done',
    content: { title: '🏃 운동 완료!', body },
    trigger: null,
  })
}

// ─── Case 3-c: streak 달성 격려 ──────────────────────────────────────────────

export async function sendStreakEncouragement(streak: number) {
  if (streak < 2) return  // 2일 연속부터 발송

  const milestones: Record<number, string> = {
    2:  '2일 연속 목표 달성! 습관이 만들어지고 있어요 🌱',
    3:  '3일 연속! 이제 슬슬 몸이 변하기 시작할 거예요 💪',
    5:  '5일 연속 달성! 절반 왔어요. 이 페이스면 목표 달성 확실해요 🔥',
    7:  '7일 연속! 일주일 내내 해냈어요. 대단해요 🏆',
    10: '10일 연속 달성! 진짜 다이어터가 됐어요 🎉',
    14: '14일 전부 달성! 완벽한 프로그램 완주예요 🥇',
  }

  const body = milestones[streak]
    ?? (streak % 7 === 0 ? `${streak}일 연속 달성! 믿기지 않을 정도로 잘 하고 있어요 🔥` : null)

  if (!body) return

  await Notifications.cancelScheduledNotificationAsync('streak-cheer').catch(() => {})
  await Notifications.scheduleNotificationAsync({
    identifier: 'streak-cheer',
    content: { title: `🔥 ${streak}일 연속 달성!`, body },
    trigger: null,
  })
}

// ─── Case 4: 아침 동기부여 ────────────────────────────────────────────────────

export async function scheduleMorningMotivation(daysLeft: number) {
  await Notifications.cancelScheduledNotificationAsync('morning-7').catch(() => {})
  await Notifications.scheduleNotificationAsync({
    identifier: 'morning-7',
    content: {
      title: '🍎 Good Morning!',
      body: `D-${daysLeft}. 오늘도 목표를 향해! 어제보다 조금 더 잘할 수 있어요 💚`,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: 7,
      minute: 0,
    },
  })
}

// ─── Case 5: 이탈 방지 (48시간 후 발송, 앱 열 때마다 재스케줄) ───────────────

export async function resetReengagement() {
  await Notifications.cancelScheduledNotificationAsync('re-engage').catch(() => {})
  const fireAt = new Date(Date.now() + 48 * 60 * 60 * 1000)
  await Notifications.scheduleNotificationAsync({
    identifier: 're-engage',
    content: {
      title: '🌱 돌아오세요!',
      body: '2일 동안 기록이 없어요. 작은 것부터 다시 시작해볼까요?',
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: fireAt,
    },
  })
}

// ─── Case 6: 체중 측정 리마인더 (3일 후) ─────────────────────────────────────

export async function scheduleWeightReminder() {
  await Notifications.cancelScheduledNotificationAsync('weight-remind').catch(() => {})
  const fireAt = new Date()
  fireAt.setDate(fireAt.getDate() + 3)
  fireAt.setHours(8, 0, 0, 0)
  await Notifications.scheduleNotificationAsync({
    identifier: 'weight-remind',
    content: {
      title: '⚖️ 체중 기록 시간이에요',
      body: '3일마다 체중을 기록하면 목표 달성률이 높아져요!',
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: fireAt,
    },
  })
}

// ─── 최초 권한 동의 후 전체 스케줄링 ─────────────────────────────────────────

export async function scheduleAllNotifications(daysLeft: number) {
  await Promise.allSettled([
    scheduleMealReminders(),
    scheduleExerciseReminder(),
    scheduleMorningMotivation(daysLeft),
    scheduleWeightReminder(),
    resetReengagement(),
  ])
}

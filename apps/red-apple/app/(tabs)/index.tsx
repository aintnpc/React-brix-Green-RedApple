import { useRef, useEffect, useState, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Animated,
  Platform,
  UIManager,
} from 'react-native'
import { AppleGauge } from '../../components/AppleGauge'
import { useFocusEffect, router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colorsDark as colors } from '@repo/theme'
import { getTodayString } from '@repo/shared'
import type { MealLog } from '@repo/shared'
import { calculateBuildGoals } from '@repo/shared'
import type { BuildBodyInfo, TodayBuildGoals } from '@repo/shared'
import { useAuthStore } from '../../store/auth'
import { useDietStore } from '../../store/diet'
import { useExerciseLogStore } from '../../store/exerciseLog'
import { useUIStore } from '../../store/ui'
import { scheduleExerciseReminder, cancelExerciseReminder, getNotificationStatus, scheduleMorningMotivation } from '../../lib/notifications'

if (Platform.OS === 'android') {
  UIManager.setLayoutAnimationEnabledExperimental?.(true)
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MUSCLE_KO: Record<string, string> = {
  chest:      '가슴',
  back:       '등',
  shoulders:  '어깨',
  biceps:     '이두',
  triceps:    '삼두',
  forearms:   '전완',
  abs:        '복근',
  obliques:   '옆구리',
  glutes:     '둔근',
  quads:      '대퇴사두',
  hamstrings: '햄스트링',
  calves:     '종아리',
  traps:      '승모근',
  lats:       '광배근',
  lower_back: '허리',
}

const MUSCLE_EMOJI: Record<string, string> = {
  chest:      '🫁',
  back:       '🔙',
  shoulders:  '💪',
  biceps:     '💪',
  triceps:    '💪',
  forearms:   '🤜',
  abs:        '🦴',
  obliques:   '🌀',
  glutes:     '🍑',
  quads:      '🦵',
  hamstrings: '🦵',
  calves:     '🦵',
  traps:      '🏔',
  lats:       '🦅',
  lower_back: '🔻',
}

const SPLIT_KO: Record<string, string> = {
  full_body:       'Full Body',
  upper_lower:     '상하체 분할',
  push_pull_legs:  'PPL',
  bro_split:       '브로 스플릿',
}

const GOAL_KO: Record<string, string> = {
  bulk:     '증량',
  cut:      '감량',
  maintain: '유지',
}

const GOAL_COLOR: Record<string, string> = {
  bulk:     '#FF9500',
  cut:      colors.mint,
  maintain: '#30D158',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function scoreColor(score: number) {
  if (score < 40) return '#FF3B30'
  if (score < 70) return '#FF9500'
  return '#34C759'
}

function calcStreak(logs: MealLog[], proteinGoal: number): number {
  const dateProtein = new Map<string, number>()
  for (const log of logs) {
    dateProtein.set(log.date, (dateProtein.get(log.date) ?? 0) + log.total_nutrition.protein)
  }
  let streak = 0
  const base = new Date()
  for (let i = 0; i < 365; i++) {
    const d = new Date(base)
    d.setDate(d.getDate() - i)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const protein = dateProtein.get(key) ?? 0
    if (protein >= proteinGoal * 0.8) streak++
    else break
  }
  return streak
}

// ─── Flip Number ──────────────────────────────────────────────────────────────

function FlipNumber({ value, style }: { value: number; style?: object }) {
  const prev = useRef(value)
  const anim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (prev.current === value) return
    anim.setValue(0)
    Animated.timing(anim, { toValue: 1, duration: 350, useNativeDriver: true }).start(() => {
      prev.current = value
      anim.setValue(0)
    })
  }, [value])

  const translateY = anim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, -12, 0] })
  const opacity    = anim.interpolate({ inputRange: [0, 0.4, 0.6, 1], outputRange: [1, 0, 0, 1] })

  return (
    <Animated.Text style={[style, { transform: [{ translateY }], opacity }]}>
      {value}
    </Animated.Text>
  )
}

// ─── Macro Bar ────────────────────────────────────────────────────────────────

function MacroBar({ carbs, protein, fat }: { carbs: number; protein: number; fat: number }) {
  const total = carbs + protein + fat || 1
  return (
    <View style={mb.bar}>
      <View style={[mb.seg, { flex: carbs / total, backgroundColor: colors.macroCarb }]} />
      <View style={[mb.seg, { flex: protein / total, backgroundColor: colors.macroProtein }]} />
      <View style={[mb.seg, { flex: fat / total, backgroundColor: colors.macroFat }]} />
    </View>
  )
}
const mb = StyleSheet.create({
  bar: { flexDirection: 'row', height: 6, borderRadius: 3, overflow: 'hidden', backgroundColor: colors.borderSoft },
  seg: { height: 6 },
})

// ─── Stagger hook ────────────────────────────────────────────────────────────

function useStagger(count: number) {
  const anims = useRef(
    Array.from({ length: count }, () => ({
      opacity: new Animated.Value(0),
      ty: new Animated.Value(22),
    }))
  ).current

  useEffect(() => {
    Animated.parallel(
      anims.map((a, i) =>
        Animated.parallel([
          Animated.timing(a.opacity, { toValue: 1, duration: 500, delay: i * 85, useNativeDriver: true }),
          Animated.timing(a.ty, { toValue: 0, duration: 500, delay: i * 85, useNativeDriver: true }),
        ])
      )
    ).start()
  }, [])

  return anims.map((a) => ({ opacity: a.opacity, transform: [{ translateY: a.ty }] }))
}

// ─── Today's Muscle Card ──────────────────────────────────────────────────────

function TodayMuscleCard({ muscleGroups, splitType, onGoWorkout }: {
  muscleGroups: string[]
  splitType: string
  onGoWorkout: () => void
}) {
  const isRest = muscleGroups.length === 0

  return (
    <View style={[styles.card, { padding: 0 }]}>
      {/* Header */}
      <View style={styles.muscleTop}>
        <Text style={styles.prescSparkle}>✦</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.prescMicro}>오늘의 처방 · {SPLIT_KO[splitType] ?? splitType}</Text>
        </View>
        {!isRest && (
          <TouchableOpacity style={styles.prescCTA} onPress={onGoWorkout} activeOpacity={0.8}>
            <Text style={styles.prescCTAText}>운동 시작 →</Text>
          </TouchableOpacity>
        )}
      </View>

      {isRest ? (
        <View style={styles.restBody}>
          <Text style={styles.restEmoji}>😴</Text>
          <Text style={styles.restTitle}>오늘은 쉬는 날이에요</Text>
          <Text style={styles.restSub}>충분한 휴식이 근육 회복을 도와요</Text>
        </View>
      ) : (
        <View style={styles.muscleGrid}>
          {muscleGroups.map((m) => (
            <View key={m} style={styles.muscleChip}>
              <Text style={styles.muscleChipEmoji}>{MUSCLE_EMOJI[m] ?? '💪'}</Text>
              <Text style={styles.muscleChipText}>{MUSCLE_KO[m] ?? m}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  )
}

// ─── Home Screen ──────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const insets = useSafeAreaInsets()
  const { session, bodyInfo } = useAuthStore()
  const { getTodayLogs, logs: allLogs, syncFromDB } = useDietStore()
  const { getTodayLogs: getTodayExLogs } = useExerciseLogStore()
  const { checkAndTriggerDailyReport, postWorkoutCoach, clearPostWorkoutCoach } = useUIStore()

  const [animKey, setAnimKey] = useState(0)

  useFocusEffect(useCallback(() => {
    setAnimKey((k) => k + 1)
    checkAndTriggerDailyReport()
    const { session, bodyInfo, programStartedAt, isPremium } = useAuthStore.getState()
    if (session) {
      syncFromDB(session.user.id)
    }
    if (isPremium && bodyInfo && programStartedAt) {
      const targetDays = bodyInfo.target_days ?? 84
      const startDate = new Date(programStartedAt).toLocaleDateString('en-CA')
      const todayStr  = new Date().toLocaleDateString('en-CA')
      const elapsed   = Math.floor((new Date(todayStr).getTime() - new Date(startDate).getTime()) / 86_400_000)
      if (elapsed >= targetDays) {
        router.replace('/completion')
        return
      }
      const actualDaysLeft = Math.max(0, targetDays - elapsed)
      getNotificationStatus().then((status) => {
        if (status !== 'granted') return
        scheduleMorningMotivation(actualDaysLeft).catch(() => {})
        const { getTodayLogs } = useExerciseLogStore.getState()
        const todayStr2 = new Date().toLocaleDateString('en-CA')
        const todayLogs = getTodayLogs(todayStr2)
        if (todayLogs.length > 0) {
          cancelExerciseReminder().catch(() => {})
        } else {
          scheduleExerciseReminder().catch(() => {})
        }
      })
    }
  }, []))

  const today = getTodayString()
  const todayMeals   = getTodayLogs(today)
  const todayExLogs  = getTodayExLogs(today)

  // 오늘 섭취 집계
  const consumed = todayMeals.reduce(
    (acc, m) => ({
      calories: acc.calories + m.total_nutrition.calories,
      protein:  acc.protein  + m.total_nutrition.protein,
      carbs:    acc.carbs    + m.total_nutrition.carbs,
      fat:      acc.fat      + m.total_nutrition.fat,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  )

  // 오늘 볼륨 (세트 × 무게 × 횟수) 집계
  const todayVolume = todayExLogs.reduce((sum, log) => {
    if (!log.sets) return sum
    return sum + log.sets.reduce((s, set) => s + ((set.reps ?? 0) * (set.weight_kg ?? 0)), 0)
  }, 0)

  const todaySets = todayExLogs.reduce((sum, log) => sum + (log.sets?.length ?? 0), 0)

  // BuildBodyInfo 구성 (onboarding form에서 저장된 값이 없으면 기본값)
  const buildInfo: BuildBodyInfo | null = bodyInfo ? {
    ...bodyInfo,
    build_goal: (bodyInfo as BuildBodyInfo).build_goal ?? 'bulk',
    split_type: (bodyInfo as BuildBodyInfo).split_type ?? 'full_body',
    experience_level: (bodyInfo as BuildBodyInfo).experience_level ?? 'beginner',
    training_days_per_week:
      (bodyInfo as BuildBodyInfo).split_type === 'upper_lower' ? 4
      : (bodyInfo as BuildBodyInfo).split_type === 'push_pull_legs' ? 6
      : (bodyInfo as BuildBodyInfo).split_type === 'bro_split' ? 5
      : 3,
  } : null

  const programStartedAt = useAuthStore.getState().programStartedAt ?? new Date().toISOString()
  const completedToday = todayExLogs.some((l) => l.sets && l.sets.length > 0)
  const buildGoals: TodayBuildGoals | null = buildInfo
    ? calculateBuildGoals(buildInfo, programStartedAt, todaySets, completedToday)
    : null

  const proteinGoal  = buildGoals?.proteinGoal ?? 160
  const calorieGoal  = buildGoals?.calorieGoal ?? 2500
  const todayMuscles = buildGoals?.todayMuscleGroups ?? []
  const splitType    = buildInfo?.split_type ?? 'full_body'
  const bodyGoal     = buildInfo?.build_goal ?? 'bulk'
  const goalColor    = GOAL_COLOR[bodyGoal] ?? colors.mint

  const targetDays  = bodyInfo?.target_days ?? 84
  const daysLeft = (() => {
    const start = new Date(programStartedAt).toLocaleDateString('en-CA')
    const todayStr = new Date().toLocaleDateString('en-CA')
    const elapsed = Math.floor((new Date(todayStr).getTime() - new Date(start).getTime()) / 86_400_000)
    return Math.max(0, targetDays - elapsed)
  })()

  const endDate = (() => {
    const start = programStartedAt ? new Date(programStartedAt) : new Date()
    const end = new Date(start)
    end.setDate(end.getDate() + targetDays)
    return `${end.getMonth() + 1}/${end.getDate()}`
  })()

  const userName = session?.user.nickname ?? session?.user.name ?? '사용자'
  const streak   = calcStreak(allLogs, proteinGoal)

  // 점수: 단백질 60점 + 볼륨 40점
  const proteinScore = Math.round(Math.min(consumed.protein / Math.max(proteinGoal, 1), 1) * 60)
  const volumeScore  = (() => {
    const weeklyVolumeTarget = buildGoals?.weeklyVolumeTarget ?? 120
    const dailyVolumeTarget  = weeklyVolumeTarget / (buildInfo?.training_days_per_week ?? 3)
    return Math.round(Math.min(todaySets / Math.max(dailyVolumeTarget, 1), 1) * 40)
  })()
  const totalScore = proteinScore + volumeScore

  const stagger = useStagger(5)

  // 체크리스트
  const CHECKLIST = [
    {
      id: 'protein',
      icon: '🥩',
      label: '단백질 목표',
      sublabel: `${consumed.protein}g / ${proteinGoal}g`,
      maxPoints: 60,
      earnedPoints: proteinScore,
      progress: Math.min(consumed.protein / Math.max(proteinGoal, 1), 1),
      done: proteinScore >= 48,
    },
    {
      id: 'volume',
      icon: '🏋️',
      label: '운동 볼륨',
      sublabel: todaySets > 0
        ? `${todaySets}세트 완료 · ${Math.round(todayVolume).toLocaleString()}kg`
        : '아직 운동 기록이 없어요',
      maxPoints: 40,
      earnedPoints: volumeScore,
      progress: Math.min(volumeScore / 40, 1),
      done: volumeScore >= 32,
    },
  ]

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Greeting ── */}
        <Animated.View style={[styles.greeting, stagger[0]]}>
          <View style={styles.greetRow}>
            <Text style={styles.greetText}>
              안녕하세요, <Text style={styles.greetName}>{userName}</Text>님
            </Text>
            <View style={styles.greetDDay}>
              <Text style={styles.greetDDayNum}>D-{daysLeft}</Text>
              <Text style={styles.greetDDaySub}>종료 {endDate}</Text>
            </View>
          </View>
        </Animated.View>

        {/* ── Streak + Goal Badge ── */}
        <Animated.View style={[styles.streakWrap, stagger[1]]}>
          <View style={styles.badgeRow}>
            {streak > 0 ? (
              <View style={styles.streakBadge}>
                <Text style={styles.streakFire}>🔥</Text>
                <Text style={styles.streakText}>
                  <Text style={styles.streakNum}>{streak}일</Text> 연속 단백질 달성!
                </Text>
              </View>
            ) : (
              <View style={styles.streakBadge}>
                <Text style={styles.streakFire}>💪</Text>
                <Text style={styles.streakText}>오늘 단백질 목표를 채워봐요!</Text>
              </View>
            )}
            <View style={[styles.goalBadge, { borderColor: goalColor + '60', backgroundColor: goalColor + '18' }]}>
              <Text style={[styles.goalBadgeText, { color: goalColor }]}>
                {GOAL_KO[bodyGoal]} · {SPLIT_KO[splitType]}
              </Text>
            </View>
          </View>
        </Animated.View>

        {/* ── Score Card ── */}
        <Animated.View style={stagger[2]}>
          <View style={styles.card}>
            <View style={styles.mainTop}>
              <AppleGauge score={totalScore} animKey={animKey} />
              <View style={styles.dDayBlock}>
                <View style={styles.infoCol}>
                  <Text style={styles.weightLabel}>오늘 점수</Text>
                  <Text style={[styles.scoreNum, { color: scoreColor(totalScore) }]}>
                    {totalScore}<Text style={styles.scoreUnit}>점</Text>
                  </Text>
                  <Text style={styles.weightTarget}>만점 100점</Text>
                </View>
                <View style={styles.infoCol}>
                  <Text style={styles.weightLabel}>총 진행률</Text>
                  <Text style={styles.weightDiff}>
                    {Math.round(((targetDays - daysLeft) / targetDays) * 100)}
                    <Text style={styles.weightUnit}>%</Text>
                  </Text>
                  <Text style={styles.weightTarget}>{targetDays - daysLeft}일 / {targetDays}일</Text>
                </View>
              </View>
            </View>
            <View style={styles.sectionDivider} />
            <View style={styles.checklist}>
              {CHECKLIST.map((item) => (
                <View key={item.id} style={styles.checkRow}>
                  <View style={[styles.checkIcon, item.done && styles.checkIconDone]}>
                    <Text style={styles.checkIconText}>{item.done ? '✓' : item.icon}</Text>
                  </View>
                  <View style={styles.checkBody}>
                    <Text style={[styles.checkLabel, item.done && styles.checkLabelDone]}>{item.label}</Text>
                    <Text style={styles.checkSub}>{item.sublabel}</Text>
                    {item.progress > 0 && item.progress < 1 && (
                      <View style={styles.checkProgressBar}>
                        <View style={[styles.checkProgressFill, { width: `${item.progress * 100}%`, backgroundColor: scoreColor(totalScore) }]} />
                      </View>
                    )}
                  </View>
                  <View style={[styles.pointsBadge, item.done && styles.pointsBadgeDone]}>
                    <Text style={[styles.pointsText, item.done && styles.pointsTextDone]}>+{item.earnedPoints}점</Text>
                    <Text style={styles.pointsMax}>/{item.maxPoints}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        </Animated.View>

        {/* ── Post-Workout Coach Banner ── */}
        {postWorkoutCoach && (
          <View style={styles.coachBanner}>
            <View style={styles.coachBannerTop}>
              <Text style={styles.coachBannerIcon}>🧑‍💼</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.coachBannerLabel}>트레이너 피드백</Text>
                <Text style={styles.coachBannerMsg}>
                  {postWorkoutCoach.muscles.join('·')} {postWorkoutCoach.totalSets}세트 완료 💪{'\n'}
                  운동 끝났으면 지금 단백질 챙겨요. 근육이 기다리고 있어요.
                </Text>
              </View>
              <TouchableOpacity
                onPress={clearPostWorkoutCoach}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Text style={{ color: colors.textTertiary, fontSize: 16 }}>✕</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={styles.coachBannerCTA}
              onPress={() => { clearPostWorkoutCoach(); router.push('/(tabs)/diet') }}
              activeOpacity={0.85}
            >
              <Text style={styles.coachBannerCTAText}>식단 기록하러 가기 →</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Today's Workout Prescription ── */}
        <Animated.View style={stagger[3]}>
          <TodayMuscleCard
            muscleGroups={todayMuscles}
            splitType={splitType}
            onGoWorkout={() => router.push({ pathname: '/workout', params: { muscles: todayMuscles.join(',') } })}
          />
        </Animated.View>

        {/* ── Diet Card ── */}
        <Animated.View style={stagger[4]}>
          <View style={styles.card}>
            <View style={styles.mealHeaderRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sectionTitle}>
                  오늘의 <Text style={styles.sectionTitleAccent}>식단</Text>
                </Text>
                <Text style={styles.sectionSub}>🥩 단백질 중심으로 기록해요</Text>
              </View>
              <TouchableOpacity
                style={styles.dietBtn}
                onPress={() => router.push('/(tabs)/diet')}
                activeOpacity={0.8}
              >
                <Text style={styles.dietBtnText}>기록하기 →</Text>
              </TouchableOpacity>
            </View>

            {/* Protein progress bar */}
            <View style={styles.proteinRow}>
              <Text style={styles.mealMicro}>단백질 달성률</Text>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
                <FlipNumber value={consumed.protein} style={styles.proteinNum} />
                <Text style={styles.proteinGoalText}>/ {proteinGoal}g</Text>
              </View>
            </View>
            <View style={styles.proteinBar}>
              <View style={[styles.proteinBarFill, {
                width: `${Math.min(consumed.protein / Math.max(proteinGoal, 1), 1) * 100}%`,
                backgroundColor: consumed.protein >= proteinGoal ? '#30D158' : colors.mint,
              }]} />
            </View>

            <View style={styles.sectionDivider} />

            {/* Calorie row */}
            <View style={styles.calRow}>
              <Text style={styles.calLabel}>칼로리</Text>
              <Text style={styles.calValue}>{consumed.calories.toLocaleString()} <Text style={styles.calGoal}>/ {calorieGoal.toLocaleString()} kcal</Text></Text>
            </View>

            {/* Macro bar */}
            <MacroBar carbs={consumed.carbs} protein={consumed.protein} fat={consumed.fat} />
            <View style={styles.macroLegend}>
              {[
                { label: '탄수화물', val: consumed.carbs,   goal: buildGoals?.carbGoal    ?? 300, color: colors.macroCarb },
                { label: '단백질',   val: consumed.protein, goal: buildGoals?.proteinGoal ?? 160, color: colors.macroProtein },
                { label: '지방',     val: consumed.fat,     goal: buildGoals?.fatGoal      ?? 60,  color: colors.macroFat },
              ].map((m) => (
                <View key={m.label} style={styles.macroItem}>
                  <View style={[styles.macroDot, { backgroundColor: m.color }]} />
                  <Text style={styles.macroLbl}>{m.label}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 1 }}>
                    <FlipNumber value={m.val} style={styles.macroVal} />
                    <Text style={styles.macroGoalText}>/{m.goal}g</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        </Animated.View>

        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 110 },

  greeting:   { marginBottom: 8 },
  streakWrap: { marginBottom: 16 },
  badgeRow:   { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  streakBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#1C1C1E', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6,
    borderWidth: 1, borderColor: colors.borderSoft,
  },
  streakFire: { fontSize: 14 },
  streakText: { fontSize: 13, fontWeight: '500', color: colors.textSecondary },
  streakNum:  { fontWeight: '800', color: colors.textPrimary },
  goalBadge: {
    borderRadius: 20, borderWidth: 1,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  goalBadgeText: { fontSize: 12, fontWeight: '700' },
  greetRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  greetText:   { fontSize: 15, fontWeight: '500', color: colors.textSecondary },
  greetName:   { fontWeight: '600', color: colors.textPrimary },
  greetDDay:   { alignItems: 'flex-end', marginTop: 10 },
  greetDDayNum:{ fontSize: 28, fontWeight: '800', color: colors.textPrimary, letterSpacing: -1, lineHeight: 32 },
  greetDDaySub:{ fontSize: 13, fontWeight: '600', color: colors.textPrimary, marginTop: 2 },

  card: {
    backgroundColor: colors.surface, borderRadius: 20, padding: 20, marginBottom: 12,
    shadowColor: '#101828', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 2, elevation: 2,
  },

  // Score card
  mainTop:   { flexDirection: 'row', gap: 20, alignItems: 'stretch' },
  dDayBlock: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  infoCol:   { flex: 1, gap: 2 },
  scoreNum:  { fontSize: 30, fontWeight: '700', letterSpacing: -0.6 },
  scoreUnit: { fontSize: 16, fontWeight: '500', color: colors.textSecondary },
  weightLabel:  { fontSize: 11, fontWeight: '600', color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 2 },
  weightDiff:   { fontSize: 30, fontWeight: '700', color: colors.textPrimary, letterSpacing: -0.6 },
  weightUnit:   { fontSize: 16, fontWeight: '500', color: colors.textSecondary },
  weightTarget: { fontSize: 12, color: colors.textTertiary, marginTop: 2 },
  sectionDivider: { height: 1, backgroundColor: colors.borderSoft, marginVertical: 16 },

  // Checklist
  checklist:    { gap: 12 },
  checkRow:     { flexDirection: 'row', alignItems: 'center', gap: 12 },
  checkIcon: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.borderSoft,
  },
  checkIconDone:  { backgroundColor: colors.textPrimary, borderColor: colors.textPrimary },
  checkIconText:  { fontSize: 16 },
  checkBody:      { flex: 1, gap: 3 },
  checkLabel:     { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  checkLabelDone: { color: colors.textTertiary },
  checkSub:       { fontSize: 11, color: colors.textTertiary },
  checkProgressBar:  { height: 3, borderRadius: 2, backgroundColor: colors.borderSoft, overflow: 'hidden', marginTop: 2 },
  checkProgressFill: { height: 3, borderRadius: 2 },
  pointsBadge: {
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
    backgroundColor: colors.background, borderWidth: 1, borderColor: colors.borderSoft, alignItems: 'center',
  },
  pointsBadgeDone: { backgroundColor: colors.textPrimary, borderColor: colors.textPrimary },
  pointsText:      { fontSize: 12, fontWeight: '700', color: colors.textPrimary },
  pointsTextDone:  { color: '#fff' },
  pointsMax:       { fontSize: 10, color: colors.textTertiary },

  // Post-Workout Coach Banner
  coachBanner: {
    backgroundColor: `${colors.mint}12`,
    borderRadius: 18, padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: `${colors.mint}35`,
  },
  coachBannerTop:   { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 12 },
  coachBannerIcon:  { fontSize: 22, marginTop: 2 },
  coachBannerLabel: { fontSize: 11, fontWeight: '700', color: colors.mint, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  coachBannerMsg:   { fontSize: 13, color: colors.textSecondary, lineHeight: 20 },
  coachBannerCTA: {
    backgroundColor: colors.mint, borderRadius: 12,
    paddingVertical: 11, alignItems: 'center',
  },
  coachBannerCTAText: { fontSize: 13, fontWeight: '700', color: '#fff' },

  // Today's Muscle Card
  muscleTop: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 20, borderBottomWidth: 1, borderBottomColor: colors.borderSoft,
  },
  prescSparkle: { fontSize: 18, marginTop: 1, color: '#E83B3B' },
  prescMicro:   { fontSize: 11, fontWeight: '600', color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  prescSummary: { fontSize: 17, fontWeight: '700', color: colors.textPrimary, letterSpacing: -0.3 },
  prescCTA: {
    backgroundColor: colors.mint, borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 8,
  },
  prescCTAText: { fontSize: 12, fontWeight: '700', color: '#fff' },

  restBody: { padding: 24, alignItems: 'center', gap: 6 },
  restEmoji: { fontSize: 36 },
  restTitle: { fontSize: 16, fontWeight: '600', color: colors.textPrimary },
  restSub:   { fontSize: 13, color: colors.textTertiary },

  muscleGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8,
    padding: 20,
  },
  muscleChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.background, borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 8,
    borderWidth: 1, borderColor: colors.borderSoft,
  },
  muscleChipEmoji: { fontSize: 16 },
  muscleChipText:  { fontSize: 13, fontWeight: '600', color: colors.textPrimary },

  // Diet Card
  mealHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 16 },
  sectionTitle:       { fontSize: 17, fontWeight: '600', color: colors.textPrimary, letterSpacing: -0.3, marginBottom: 3 },
  sectionTitleAccent: { color: colors.mint },
  sectionSub:    { fontSize: 12, color: colors.textTertiary },
  dietBtn: {
    backgroundColor: colors.background, borderRadius: 14,
    paddingHorizontal: 12, paddingVertical: 8,
    borderWidth: 1, borderColor: colors.borderSoft,
  },
  dietBtnText: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },

  proteinRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 },
  mealMicro:      { fontSize: 11, fontWeight: '600', color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5 },
  proteinNum:     { fontSize: 28, fontWeight: '800', color: colors.mint, letterSpacing: -0.8 },
  proteinGoalText:{ fontSize: 14, color: colors.textTertiary },
  proteinBar:     { height: 8, borderRadius: 4, backgroundColor: colors.borderSoft, overflow: 'hidden', marginBottom: 4 },
  proteinBarFill: { height: 8, borderRadius: 4 },

  calRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  calLabel: { fontSize: 13, color: colors.textTertiary, fontWeight: '500' },
  calValue: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  calGoal:  { fontSize: 12, fontWeight: '400', color: colors.textTertiary },

  macroLegend:  { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
  macroItem:    { flexDirection: 'row', alignItems: 'center', gap: 5 },
  macroDot:     { width: 8, height: 8, borderRadius: 4 },
  macroLbl:     { fontSize: 12, color: colors.textSecondary },
  macroVal:     { fontSize: 12, fontWeight: '600', color: colors.textPrimary },
  macroGoalText:{ fontWeight: '400', color: colors.textTertiary, fontSize: 12 },
})

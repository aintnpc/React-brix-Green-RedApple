import { useState, useRef, useCallback, useEffect } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
  KeyboardAvoidingView,
  Animated,
  PanResponder,
  ActivityIndicator,
  TextInput,
  type LayoutChangeEvent,
} from 'react-native'
import { useLocalSearchParams, router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors } from '@repo/theme'
import type { BodyInfo, ActivityLevel, Gender } from '@repo/shared'
import { calculateCalorieGoal, calculateMacroGoals, calculateWeightPlan, calculateTDEE } from '@repo/shared'
import { useAuthStore } from '../../store/auth'
import { requestNotificationPermission, scheduleAllNotifications } from '../../lib/notifications'
import { requestHealthKitPermission } from '../../lib/health'
import {
  type UnitSystem,
  kgToDisplay, displayToKg, cmToDisplayInch, inchToCm,
  kgToLb, lbToKg, weightUnit, heightUnit,
} from '../../lib/locale'
import { t, ta } from '../../lib/i18n'

// regoal 모드: 활동량(3) → 체중(4) → 운동시간(5) → 플랜(6) → 건강(7) → 알림(8)
const REGOAL_STEPS = [3, 4, 5, 6, 7, 8]
const TOTAL_STEPS = 9

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets()
  const { setBodyInfo, setNickname, session, bodyInfo: existingBodyInfo, unitSystem } = useAuthStore()
  const params = useLocalSearchParams<{ mode?: string }>()
  const isRegoal = (Array.isArray(params.mode) ? params.mode[0] : params.mode) === 'regoal'

  // regoal 모드면 기존 bodyInfo 값으로 채워두고, 없으면 기본값
  const [step, setStep] = useState(() => isRegoal ? REGOAL_STEPS[0] : 0)
  const [notifLoading, setNotifLoading] = useState(false)
  const [healthLoading, setHealthLoading] = useState(false)
  const [nickname, setNicknameState] = useState('')
  const [form, setForm] = useState({
    goal: 'lose_weight' as const,
    gender: (existingBodyInfo?.gender ?? 'male') as Gender,
    height: existingBodyInfo?.height ?? 170,
    age: existingBodyInfo?.age ?? 28,
    weight: existingBodyInfo?.weight ?? 70,
    target_weight: existingBodyInfo?.target_weight ?? 66,
    activity_level: (existingBodyInfo?.activity_level ?? 'moderate') as ActivityLevel,
    exercise_minutes_per_day: existingBodyInfo?.exercise_minutes_per_day ?? 30,
  })

  const update = useCallback((k: string, v: any) =>
    setForm((f) => {
      const next = { ...f, [k]: v }
      if (k === 'weight') {
        // weight 바꾸면 target_weight를 현재 - 4로 리셋 (StepWeight에서 상한 재계산됨)
        next.target_weight = Math.max(40, v - 4)
      }
      return next
    }), [])

  const buildBodyInfo = (): BodyInfo => ({
    user_id: session?.user?.id ?? '',
    height: form.height,
    weight: form.weight,
    age: form.age,
    gender: form.gender,
    goal: form.goal,
    activity_level: form.activity_level,
    target_weight: form.target_weight,
    target_days: 14,
    exercise_minutes_per_day: form.exercise_minutes_per_day,
  })

  const handleNext = () => {
    if (isRegoal) {
      const idx = REGOAL_STEPS.indexOf(step)
      if (idx < REGOAL_STEPS.length - 1) {
        setStep(REGOAL_STEPS[idx + 1])
      }
      return
    }
    if (step === 0) {
      if (nickname.trim().length === 0) return
      setNickname(nickname.trim())
      setStep(1)
    } else if (step < 6) {
      setStep((s) => s + 1)
    } else if (step === 6) {
      setStep(7)
    } else if (step === 7) {
      setStep(8)
    }
  }

  const handlePrev = () => {
    if (isRegoal) {
      const idx = REGOAL_STEPS.indexOf(step)
      if (idx > 0) setStep(REGOAL_STEPS[idx - 1])
      return
    }
    if (step > 0) setStep((s) => s - 1)
  }

  const finishOnboarding = () => {
    const bodyInfo = buildBodyInfo()
    const calGoal = calculateCalorieGoal(bodyInfo)
    const macros = calculateMacroGoals(calGoal, bodyInfo.goal)
    setBodyInfo(bodyInfo, macros)
    if (isRegoal) {
      // 재목표 설정 완료 → paywall로 (새 플랜 구매 유도)
      router.replace('/paywall')
    }
    // 일반 온보딩은 setBodyInfo 후 _layout이 /paywall로 자동 이동
  }

  const handleHealthAllow = async () => {
    setHealthLoading(true)
    try {
      await requestHealthKitPermission()
    } finally {
      setHealthLoading(false)
      setStep(8)
    }
  }

  const handleHealthSkip = () => setStep(8)

  const handleNotifAllow = async () => {
    setNotifLoading(true)
    try {
      const granted = await requestNotificationPermission()
      if (granted) await scheduleAllNotifications(14)
    } finally {
      setNotifLoading(false)
      finishOnboarding()
    }
  }

  const handleNotifSkip = () => {
    finishOnboarding()
  }

  const isHealthStep = step === 7
  const isNotifStep = step === 8

  // regoal 모드에서 dot 진행률 계산
  const regoalDotIndex = isRegoal ? REGOAL_STEPS.indexOf(step) : step
  const regoalTotalDots = isRegoal ? REGOAL_STEPS.length : TOTAL_STEPS

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Top bar */}
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          onPress={handlePrev}
          disabled={step === 0 || isNotifStep}
          style={[styles.backBtn, (step === 0 || isNotifStep) && styles.backBtnHidden]}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={styles.backChevron}>‹</Text>
        </TouchableOpacity>

        <View style={styles.dots}>
          {Array.from({ length: regoalTotalDots }).map((_, i) => (
            <View key={i} style={[styles.dot, i === regoalDotIndex ? styles.dotActive : styles.dotInactive]} />
          ))}
        </View>

        <View style={styles.backBtn} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {step === 0 && <StepNickname value={nickname} onChange={setNicknameState} />}
        {step === 1 && <StepGender form={form} onChange={update} />}
        {step === 2 && <StepHeight form={form} onChange={update} unitSystem={unitSystem} />}
        {step === 3 && <StepActivity form={form} onChange={update} />}
        {step === 4 && <StepWeight form={form} onChange={update} unitSystem={unitSystem} />}
        {step === 5 && <StepExercise form={form} onChange={update} />}
        {step === 6 && <StepPlan form={form} unitSystem={unitSystem} />}
        {step === 7 && (
          <StepHealthKit
            loading={healthLoading}
            onAllow={handleHealthAllow}
            onSkip={handleHealthSkip}
          />
        )}
        {step === 8 && (
          <StepNotification
            loading={notifLoading}
            onAllow={handleNotifAllow}
            onSkip={handleNotifSkip}
          />
        )}
      </ScrollView>

      {!isHealthStep && !isNotifStep && (
        <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 16 }]}>
          <TouchableOpacity style={styles.ctaBtn} onPress={handleNext} activeOpacity={0.85}>
            <Text style={styles.ctaBtnText}>
              {step === 0
                ? (nickname.trim().length === 0 ? t('onb_nickname_required') : t('onb_next'))
                : step === 6
                  ? t('onb_plan_start')
                  : t('onb_next')}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </KeyboardAvoidingView>
  )
}

// ─── Shared: Custom Slider ────────────────────────────────────────────────────

interface SliderProps {
  min: number
  max: number
  value: number
  step?: number
  onValueChange: (v: number) => void
  trackColor?: string
}

function SliderTrack({ min, max, value, step = 1, onValueChange, trackColor }: SliderProps) {
  const trackWidth = useRef(0)
  const startValue = useRef(value)
  // valueRef: PanResponder 클로저 안에서 항상 최신 value를 읽기 위함
  const valueRef = useRef(value)
  valueRef.current = value
  // min/max도 동일하게 ref로 유지
  const minRef = useRef(min)
  const maxRef = useRef(max)
  minRef.current = min
  maxRef.current = max

  const fill = Math.max(0, Math.min(1, (value - min) / (max - min)))

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => { startValue.current = valueRef.current },
      onPanResponderMove: (_, g) => {
        if (trackWidth.current === 0) return
        const range = maxRef.current - minRef.current
        const ratio = g.dx / trackWidth.current
        const raw = startValue.current + ratio * range
        const stepped = Math.round(raw / step) * step
        onValueChange(Math.max(minRef.current, Math.min(maxRef.current, stepped)))
      },
    })
  ).current

  const onLayout = (e: LayoutChangeEvent) => {
    trackWidth.current = e.nativeEvent.layout.width
  }

  return (
    <View style={slStyles.container} onLayout={onLayout} {...panResponder.panHandlers}>
      <View style={slStyles.track}>
        <View style={[slStyles.fill, { width: `${fill * 100}%`, backgroundColor: trackColor ?? colors.textPrimary }]} />
      </View>
      <View style={[slStyles.thumb, { left: `${fill * 100}%`, marginLeft: -12, backgroundColor: colors.surface }]} />
    </View>
  )
}

const slStyles = StyleSheet.create({
  container: { height: 40, justifyContent: 'center', position: 'relative' },
  track: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderSoft,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: 2 },
  thumb: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: 12,
    top: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 4,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
})

// ─── Step 0: Nickname ─────────────────────────────────────────────────────────

function StepNickname({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <View style={styles.step}>
      <Text style={styles.stepEyebrow}>{t('onb_step1_eyebrow')}</Text>
      <Text style={styles.stepTitle}>{t('onb_step1_title')}</Text>
      <Text style={styles.stepDesc}>{t('onb_step1_desc')}</Text>
      <TextInput
        style={nickStyles.input}
        value={value}
        onChangeText={onChange}
        placeholder={t('onb_nickname_placeholder')}
        placeholderTextColor={colors.textTertiary}
        maxLength={12}
        autoFocus
        returnKeyType="next"
      />
      <Text style={nickStyles.hint}>{value.length} / 12</Text>
    </View>
  )
}

const nickStyles = StyleSheet.create({
  input: {
    height: 56, borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1.5, borderColor: colors.borderSoft,
    paddingHorizontal: 18,
    fontSize: 18, fontWeight: '600', color: colors.textPrimary,
    marginTop: 8,
  },
  hint: { fontSize: 12, color: colors.textTertiary, textAlign: 'right', marginTop: 8 },
})

// ─── Step 1: Gender ───────────────────────────────────────────────────────────

function StepGender({ form, onChange }: any) {
  return (
    <View style={styles.step}>
      <Text style={styles.stepEyebrow}>{t('onb_step2_eyebrow')}</Text>
      <Text style={styles.stepTitle}>{t('onb_step2_title')}</Text>
      <Text style={styles.stepDesc}>{t('onb_step2_desc')}</Text>

      <View style={styles.genderRow}>
        {(['male', 'female'] as Gender[]).map((g) => {
          const selected = form.gender === g
          return (
            <TouchableOpacity
              key={g}
              style={[styles.genderCard, selected && styles.genderCardSelected]}
              onPress={() => onChange('gender', g)}
              activeOpacity={0.8}
            >
              <Text style={[styles.genderLabel, selected && styles.genderLabelSelected]}>
                {g === 'male' ? t('onb_male') : t('onb_female')}
              </Text>
              <Text style={[styles.genderSub, selected && styles.genderSubSelected]}>
                {g === 'male' ? 'Male' : 'Female'}
              </Text>
              {selected && (
                <View style={styles.selectedBadge}>
                  <Text style={styles.selectedBadgeText}>✓</Text>
                </View>
              )}
            </TouchableOpacity>
          )
        })}
      </View>
    </View>
  )
}

// ─── Step 2: Height + Age ─────────────────────────────────────────────────────

function StepHeight({ form, onChange, unitSystem }: { form: any; onChange: any; unitSystem: UnitSystem }) {
  const isImperial = unitSystem === 'imperial'

  // imperial: 슬라이더는 총 inch (55~79in = 4'7"~6'7"), 내부 저장은 cm
  const inchVal = cmToDisplayInch(form.height)
  const heightDisplay = isImperial
    ? (() => { const ft = Math.floor(inchVal / 12); const inch = inchVal % 12; return `${ft}'${inch}"` })()
    : `${form.height}`

  const handleHeightChange = (v: number) => {
    onChange('height', isImperial ? inchToCm(v) : v)
  }

  return (
    <View style={styles.step}>
      <Text style={styles.stepEyebrow}>{t('onb_step3_eyebrow')}</Text>
      <Text style={styles.stepTitle}>{t('onb_step3_title')}</Text>
      <Text style={styles.stepDesc}>{t('onb_step3_desc')}</Text>

      {/* Height */}
      <Text style={styles.sliderFieldLabel}>{t('onb_height')}</Text>
      <View style={styles.bigNumRow}>
        <Text style={styles.bigNum}>{heightDisplay}</Text>
        <Text style={styles.bigNumUnit}>{isImperial ? '' : 'cm'}</Text>
      </View>
      {isImperial ? (
        <>
          <SliderTrack min={55} max={79} value={inchVal} onValueChange={handleHeightChange} />
          <View style={styles.sliderRange}>
            <Text style={styles.sliderRangeLabel}>4'7"</Text>
            <Text style={styles.sliderRangeLabel}>6'7"</Text>
          </View>
        </>
      ) : (
        <>
          <SliderTrack min={140} max={200} value={form.height} onValueChange={handleHeightChange} />
          <View style={styles.sliderRange}>
            <Text style={styles.sliderRangeLabel}>140 cm</Text>
            <Text style={styles.sliderRangeLabel}>200 cm</Text>
          </View>
        </>
      )}

      <View style={styles.divider} />

      {/* Age */}
      <Text style={styles.sliderFieldLabel}>{t('onb_age')}</Text>
      <View style={styles.bigNumRow}>
        <Text style={styles.bigNum}>{form.age}</Text>
        <Text style={styles.bigNumUnit}>{t('onb_age_unit')}</Text>
      </View>
      <SliderTrack min={16} max={65} value={form.age} onValueChange={(v) => onChange('age', v)} />
      <View style={styles.sliderRange}>
        <Text style={styles.sliderRangeLabel}>16 {t('onb_age_unit')}</Text>
        <Text style={styles.sliderRangeLabel}>65 {t('onb_age_unit')}</Text>
      </View>
    </View>
  )
}

// ─── Step 4: Weight ───────────────────────────────────────────────────────────

function StepWeight({ form, onChange, unitSystem }: { form: any; onChange: any; unitSystem: UnitSystem }) {
  const isImperial = unitSystem === 'imperial'
  const wUnit = weightUnit(unitSystem)

  // 표시값 (lb or kg)
  const dispWeight = kgToDisplay(form.weight, unitSystem)
  const dispTarget = kgToDisplay(form.target_weight, unitSystem)
  const diff = form.weight - form.target_weight
  const dispDiff = Math.round(kgToDisplay(diff, unitSystem) * 10) / 10

  // 슬라이더 범위 (표시 단위 기준)
  const minW = isImperial ? 88 : 40    // lb 88 ≈ kg 40
  const maxW = isImperial ? 265 : 120  // lb 265 ≈ kg 120

  // TDEE 기반 최대 감량 계산 (내부 로직은 항상 kg)
  const tdee = calculateTDEE({
    user_id: '',
    gender: form.gender,
    height: form.height,
    age: form.age,
    weight: form.weight,
    activity_level: form.activity_level,
    goal: 'lose_weight',
  })
  const floor = form.gender === 'female' ? 1200 : 1500
  const maxDailyDeficit = (tdee - floor) + 500
  const maxFatLoss = (maxDailyDeficit * 14) / 7700
  const maxTotalLoss = Math.floor(maxFatLoss + 1.5)
  const minTargetKg = Math.max(40, form.weight - maxTotalLoss)
  const minTarget = Math.round(kgToDisplay(minTargetKg, unitSystem) * 10) / 10
  const maxTarget = Math.round(kgToDisplay(form.weight - 1, unitSystem) * 10) / 10

  const handleWeightChange = (v: number) => {
    onChange('weight', isImperial ? lbToKg(v) : v)
  }
  const handleTargetChange = (v: number) => {
    onChange('target_weight', isImperial ? lbToKg(v) : v)
  }

  return (
    <View style={[styles.step, { paddingTop: 16 }]}>
      <Text style={styles.stepEyebrow}>{t('onb_step5_eyebrow')}</Text>
      <Text style={styles.stepTitle}>{t('onb_step5_title')}</Text>
      <Text style={[styles.stepDesc, { marginBottom: 14 }]}>{t('onb_step5_desc')}</Text>

      {/* Weight journey preview */}
      <View style={[styles.weightJourneyCard, { marginBottom: 16, paddingVertical: 16 }]}>
        <View style={styles.weightJourneyItem}>
          <Text style={styles.weightJourneyLabel}>{t('onb_current_label')}</Text>
          <Text style={styles.weightJourneyNum}>{dispWeight}<Text style={styles.weightJourneyUnit}>{wUnit}</Text></Text>
        </View>
        <View style={styles.weightJourneyArrow}>
          <Text style={styles.weightJourneyArrowText}>→</Text>
          <Text style={styles.weightJourneyDiff}>−{dispDiff}{wUnit}</Text>
        </View>
        <View style={styles.weightJourneyItem}>
          <Text style={styles.weightJourneyLabel}>{t('onb_target_label')}</Text>
          <Text style={[styles.weightJourneyNum, styles.weightJourneyTarget]}>
            {dispTarget}<Text style={[styles.weightJourneyUnit, { color: colors.mint }]}>{wUnit}</Text>
          </Text>
        </View>
      </View>

      {/* Current weight */}
      <Text style={styles.sliderFieldLabel}>{t('onb_current_weight')}</Text>
      <View style={[styles.bigNumRow, { marginBottom: 8 }]}>
        <Text style={[styles.bigNum, { fontSize: 60, lineHeight: 64 }]}>{dispWeight}</Text>
        <Text style={styles.bigNumUnit}>{wUnit}</Text>
      </View>
      <SliderTrack
        min={minW} max={maxW} value={dispWeight}
        onValueChange={handleWeightChange}
      />
      <View style={[styles.sliderRange, { marginTop: 4 }]}>
        <Text style={styles.sliderRangeLabel}>{minW} {wUnit}</Text>
        <Text style={styles.sliderRangeLabel}>{maxW} {wUnit}</Text>
      </View>

      <View style={[styles.divider, { marginVertical: 14 }]} />

      {/* Target weight */}
      <Text style={styles.sliderFieldLabel}>{t('onb_target_weight')}</Text>
      <View style={[styles.bigNumRow, { marginBottom: 8 }]}>
        <Text style={[styles.bigNum, { fontSize: 60, lineHeight: 64, color: colors.mint }]}>{dispTarget}</Text>
        <Text style={[styles.bigNumUnit, { color: colors.mint }]}>{wUnit}</Text>
      </View>
      <SliderTrack
        min={minTarget}
        max={maxTarget}
        value={dispTarget}
        onValueChange={handleTargetChange}
        trackColor={colors.mint}
      />
      <View style={[styles.sliderRange, { marginTop: 4 }]}>
        <Text style={styles.sliderRangeLabel}>{minTarget} {wUnit}</Text>
        <Text style={styles.sliderRangeLabel}>{maxTarget} {wUnit}</Text>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 10, gap: 8 }}>
        <View style={{
          backgroundColor: diff <= 2 ? '#34C75918' : '#FF950018',
          borderColor: diff <= 2 ? '#34C75940' : '#FF950040',
          borderWidth: 1, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5,
        }}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: diff <= 2 ? '#34C759' : '#FF9500' }}>
            🗓 {diff <= 2 ? t('onb_period_1week') : t('onb_period_2week')}
          </Text>
        </View>
        <Text style={{ fontSize: 12, color: colors.textTertiary }}>
          {t('onb_healthy_range')}
        </Text>
      </View>
    </View>
  )
}

// ─── Step 4: Activity ─────────────────────────────────────────────────────────

const ACTIVITY_LEVELS: { value: ActivityLevel; emoji: string }[] = [
  { value: 'sedentary',   emoji: '🪑' },
  { value: 'moderate',    emoji: '🚶' },
  { value: 'very_active', emoji: '🏃' },
]

const ACTIVITY_LABEL: Record<string, { label: () => string; desc: () => string }> = {
  sedentary:   { label: () => t('onb_activity_low'),    desc: () => t('onb_activity_low_desc') },
  moderate:    { label: () => t('onb_activity_medium'), desc: () => t('onb_activity_medium_desc') },
  very_active: { label: () => t('onb_activity_high'),   desc: () => t('onb_activity_high_desc') },
}

function StepActivity({ form, onChange }: any) {
  return (
    <View style={styles.step}>
      <Text style={styles.stepEyebrow}>{t('onb_step4_eyebrow')}</Text>
      <Text style={styles.stepTitle}>{t('onb_step4_title')}</Text>
      <Text style={styles.stepDesc}>{t('onb_step4_desc')}</Text>

      <View style={styles.cardGroup}>
        {ACTIVITY_LEVELS.map((a) => {
          const selected = form.activity_level === a.value
          const meta = ACTIVITY_LABEL[a.value]
          return (
            <TouchableOpacity
              key={a.value}
              style={[styles.radioCard, selected && styles.radioCardSelected]}
              onPress={() => onChange('activity_level', a.value)}
              activeOpacity={0.8}
            >
              <Text style={styles.radioCardEmoji}>{a.emoji}</Text>
              <View style={styles.radioCardBody}>
                <Text style={styles.radioCardTitle}>{meta.label()}</Text>
                <Text style={styles.radioCardDesc}>{meta.desc()}</Text>
              </View>
              <View style={[styles.checkCircle, selected && styles.checkCircleSelected]}>
                {selected && <Text style={styles.checkMark}>✓</Text>}
              </View>
            </TouchableOpacity>
          )
        })}
      </View>
    </View>
  )
}

// ─── Step 5: Exercise Time ────────────────────────────────────────────────────

const EXERCISE_OPTIONS_ONBOARDING = [
  { minutes: 15, labelKey: 'onb_ex_15_label' as const, descKey: 'onb_ex_15_desc' as const, emoji: '🚶' },
  { minutes: 30, labelKey: 'onb_ex_30_label' as const, descKey: 'onb_ex_30_desc' as const, emoji: '🏃' },
  { minutes: 60, labelKey: 'onb_ex_60_label' as const, descKey: 'onb_ex_60_desc' as const, emoji: '💪' },
  { minutes: 90, labelKey: 'onb_ex_90_label' as const, descKey: 'onb_ex_90_desc' as const, emoji: '🔥' },
]

function StepExercise({ form, onChange }: any) {
  const selected = form.exercise_minutes_per_day as number

  const kcalPerMin = 0.133 * form.weight
  const estimatedKcal = Math.round(kcalPerMin * selected)

  return (
    <View style={styles.step}>
      <Text style={styles.stepEyebrow}>{t('onb_step6_eyebrow')}</Text>
      <Text style={styles.stepTitle}>{t('onb_step6_title')}</Text>
      <Text style={styles.stepDesc}>{t('onb_step6_desc')}</Text>

      <View style={styles.cardGroup}>
        {EXERCISE_OPTIONS_ONBOARDING.map((opt) => {
          const isSelected = selected === opt.minutes
          return (
            <TouchableOpacity
              key={opt.minutes}
              style={[styles.radioCard, isSelected && styles.radioCardSelected]}
              onPress={() => onChange('exercise_minutes_per_day', opt.minutes)}
              activeOpacity={0.8}
            >
              <Text style={styles.radioCardEmoji}>{opt.emoji}</Text>
              <View style={styles.radioCardBody}>
                <Text style={styles.radioCardTitle}>{t(opt.labelKey)}</Text>
                <Text style={styles.radioCardDesc}>{t(opt.descKey)}</Text>
              </View>
              <View style={[styles.checkCircle, isSelected && styles.checkCircleSelected]}>
                {isSelected && <Text style={styles.checkMark}>✓</Text>}
              </View>
            </TouchableOpacity>
          )
        })}
      </View>

      <View style={[styles.tipCard, { marginTop: 16 }]}>
        <Text style={styles.tipEmoji}>⚡</Text>
        <View style={styles.tipBody}>
          <Text style={styles.tipTitle}>{t('onb_est_burn')}</Text>
          <Text style={styles.tipDesc}>
            {t('onb_est_burn_desc1')}<Text style={styles.tipHighlight}>{t(`onb_ex_${selected === 90 ? '90' : selected === 60 ? '60' : selected === 30 ? '30' : '15'}_label` as any)}</Text>{t('onb_est_burn_desc2')}<Text style={styles.tipHighlight}>{estimatedKcal} kcal</Text>{t('onb_est_burn_desc3')}
          </Text>
        </View>
      </View>
    </View>
  )
}

// ─── Difficulty Bar ───────────────────────────────────────────────────────────

const DIFF_COLORS = ['#30D158', '#FF9500', '#FF3B30']
const DIFF_LABELS = ['Low', 'Med', 'High']
const DIFF_LEVELS: ('low' | 'medium' | 'high')[] = ['low', 'medium', 'high']

function DifficultyBar({ level }: { level: 'low' | 'medium' | 'high' }) {
  const anims = useRef([
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
  ]).current

  useEffect(() => {
    anims.forEach((a) => a.setValue(0))
    const levelIdx = DIFF_LEVELS.indexOf(level)
    Animated.timing(anims[levelIdx], { toValue: 1, duration: 600, useNativeDriver: false }).start()
  }, [level])

  return (
    <View style={diffStyles.segs}>
      {DIFF_COLORS.map((color, i) => (
        <View key={i} style={diffStyles.seg}>
          <Animated.View style={[
            diffStyles.fill,
            {
              backgroundColor: color,
              width: anims[i].interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
            },
          ]} />
          <Text style={diffStyles.segLabel}>{DIFF_LABELS[i]}</Text>
        </View>
      ))}
    </View>
  )
}

const diffStyles = StyleSheet.create({
  segs: { flexDirection: 'row', gap: 8 },
  seg: {
    flex: 1, height: 32, borderRadius: 8,
    backgroundColor: colors.borderSoft, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
  },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0 },
  segLabel: { fontSize: 11, fontWeight: '700', color: colors.textSecondary, zIndex: 1 },
})

// ─── Step 5: Plan (user-friendly) ────────────────────────────────────────────

function StepPlan({ form, unitSystem }: { form: any; unitSystem: UnitSystem }) {
  const bodyInfo: BodyInfo = {
    user_id: '',
    height: form.height,
    weight: form.weight,
    age: form.age,
    gender: form.gender,
    goal: form.goal,
    activity_level: form.activity_level,
    target_weight: form.target_weight,
    target_days: 14,
  }

  const calGoal = calculateCalorieGoal(bodyInfo)

  let dailyDeficit = 0
  try {
    const plan = calculateWeightPlan(bodyInfo)
    dailyDeficit = plan.dailyDeficitNeeded ?? 0
  } catch {}

  const diff = form.weight - form.target_weight
  const wUnit = weightUnit(unitSystem)
  const dispWeight = kgToDisplay(form.weight, unitSystem)
  const dispTarget = kgToDisplay(form.target_weight, unitSystem)
  const dispDiff = Math.round(kgToDisplay(diff, unitSystem) * 10) / 10

  // 난이도 계산 — 하루 적자 기준
  const difficulty: 'low' | 'medium' | 'high' =
    dailyDeficit < 350 ? 'low' : dailyDeficit < 650 ? 'medium' : 'high'

  const difficultyMeta = {
    low:    { desc: () => t('onb_diff_low'),    color: '#30D158' },
    medium: { desc: () => t('onb_diff_medium'), color: '#FF9500' },
    high:   { desc: () => t('onb_diff_high'),   color: '#FF3B30' },
  }[difficulty]

  // 예상 종료일
  const endDate = (() => {
    const d = new Date()
    d.setDate(d.getDate() + 14)
    return t('onb_plan_end_date', d.getMonth() + 1, d.getDate())
  })()

  // 식사 비율 — 적자 비율 기준
  const deficitRatio = dailyDeficit / calGoal
  const mealRatio = deficitRatio > 0.3 ? '1/2' : deficitRatio > 0.15 ? '2/3' : '3/4'

  return (
    <View style={styles.step}>
      <Text style={styles.stepEyebrow}>{t('onb_plan_eyebrow')}</Text>
      <Text style={styles.stepTitle}>{t('onb_plan_title')}</Text>
      <Text style={styles.stepDesc}>{t('onb_plan_desc')}</Text>

      {/* Weight journey hero */}
      <View style={styles.planHero}>
        <View style={styles.planHeroSide}>
          <Text style={styles.planHeroLabel}>{t('onb_plan_current')}</Text>
          <Text style={styles.planHeroNum}>{dispWeight}<Text style={styles.planHeroUnit}>{wUnit}</Text></Text>
        </View>
        <View style={styles.planHeroCenter}>
          <Text style={styles.planHeroMinus}>−{dispDiff}{wUnit}</Text>
          <Text style={styles.planHeroArrow}>→</Text>
          <Text style={styles.planHeroDays}>{t('onb_plan_days', diff <= 2 ? 7 : 14)}</Text>
        </View>
        <View style={styles.planHeroSide}>
          <Text style={styles.planHeroLabel}>{t('onb_plan_target')}</Text>
          <Text style={[styles.planHeroNum, { color: colors.mint }]}>
            {dispTarget}<Text style={[styles.planHeroUnit, { color: colors.mint }]}>{wUnit}</Text>
          </Text>
        </View>
      </View>

      {/* Timeline */}
      <View style={styles.planRow}>
        <View style={[styles.planCard, { flex: 1 }]}>
          <Text style={styles.planCardLabel}>{t('onb_plan_period_label')}</Text>
          <Text style={styles.planCardValue}>D-14</Text>
          <Text style={styles.planCardSub}>{t('onb_plan_period_sub')}</Text>
        </View>
        <View style={[styles.planCard, { flex: 1 }]}>
          <Text style={styles.planCardLabel}>{t('onb_plan_end_label')}</Text>
          <Text style={styles.planCardValue}>{endDate}</Text>
          <Text style={styles.planCardSub}>{t('onb_plan_end_sub')}</Text>
        </View>
      </View>

      {/* Difficulty gauge */}
      <View style={styles.difficultyCard}>
        <Text style={styles.planCardLabel}>{t('onb_difficulty')}</Text>
        <DifficultyBar level={difficulty} />
        <Text style={[styles.difficultyDesc, { color: difficultyMeta.color }]}>
          {difficultyMeta.desc()}
        </Text>
      </View>

      {/* Friendly tips */}
      <View style={styles.tipCard}>
        <Text style={styles.tipEmoji}>🍽️</Text>
        <View style={styles.tipBody}>
          <Text style={styles.tipTitle}>{t('onb_tip_meal_title')}</Text>
          <Text style={styles.tipDesc}>
            {t('onb_tip_meal_desc1')}<Text style={styles.tipHighlight}>{mealRatio}</Text>{t('onb_tip_meal_desc2')}
          </Text>
        </View>
      </View>

      <View style={styles.tipCard}>
        <Text style={styles.tipEmoji}>📸</Text>
        <View style={styles.tipBody}>
          <Text style={styles.tipTitle}>{t('onb_tip_photo_title')}</Text>
          <Text style={styles.tipDesc}>{t('onb_tip_photo_desc')}</Text>
        </View>
      </View>


      <Text style={styles.catchphrase}>
        <Text style={styles.catchphraseItalic}>4kg in 2 weeks.</Text>
      </Text>
    </View>
  )
}

// ─── Step 7: HealthKit Permission ────────────────────────────────────────────

function StepHealthKit({ loading, onAllow, onSkip }: {
  loading: boolean
  onAllow: () => void
  onSkip: () => void
}) {
  const HEALTHKIT_ITEMS = [
    { emoji: '👟', textKey: 'onb_healthkit_bullet1' as const },
    { emoji: '📊', textKey: 'onb_healthkit_bullet2' as const },
    { emoji: '🔒', textKey: 'onb_healthkit_bullet3' as const },
  ]
  return (
    <View style={[styles.step, notifStyles.wrap]}>
      <View style={notifStyles.iconWrap}>
        <Text style={notifStyles.iconEmoji}>🍏</Text>
      </View>

      <Text style={[styles.stepTitle, notifStyles.title]}>{t('onb_healthkit_title')}</Text>
      <Text style={[styles.stepDesc, notifStyles.desc]}>{t('onb_healthkit_desc')}</Text>

      <View style={notifStyles.list}>
        {HEALTHKIT_ITEMS.map((item, i) => (
          <View key={i} style={notifStyles.listRow}>
            <View style={notifStyles.listIconWrap}>
              <Text style={notifStyles.listEmoji}>{item.emoji}</Text>
            </View>
            <Text style={notifStyles.listText}>{t(item.textKey)}</Text>
          </View>
        ))}
      </View>

      <TouchableOpacity
        style={notifStyles.allowBtn}
        onPress={onAllow}
        disabled={loading}
        activeOpacity={0.85}
      >
        {loading
          ? <ActivityIndicator color="#fff" />
          : <Text style={notifStyles.allowBtnText}>{t('onb_healthkit_btn')}</Text>
        }
      </TouchableOpacity>

      <TouchableOpacity onPress={onSkip} activeOpacity={0.6} style={notifStyles.skipBtn}>
        <Text style={notifStyles.skipText}>{t('onb_later')}</Text>
      </TouchableOpacity>
    </View>
  )
}

// ─── Step 8: Notification Permission ─────────────────────────────────────────

const NOTIF_ITEM_KEYS = [
  { emoji: '🌅', textKey: 'onb_notif_bullet1' as const },
  { emoji: '💬', textKey: 'onb_notif_bullet2' as const },
  { emoji: '🏃', textKey: 'onb_notif_bullet3' as const },
  { emoji: '🔥', textKey: 'onb_notif_bullet4' as const },
  { emoji: '⚖️', textKey: 'onb_notif_bullet5' as const },
]

function StepNotification({ loading, onAllow, onSkip }: {
  loading: boolean
  onAllow: () => void
  onSkip: () => void
}) {
  return (
    <View style={[styles.step, notifStyles.wrap]}>
      {/* Bell icon */}
      <View style={notifStyles.iconWrap}>
        <Text style={notifStyles.iconEmoji}>🔔</Text>
      </View>

      <Text style={[styles.stepTitle, notifStyles.title]}>{t('onb_notif_title')}</Text>
      <Text style={[styles.stepDesc, notifStyles.desc]}>{t('onb_notif_desc')}</Text>

      {/* Notification list */}
      <View style={notifStyles.list}>
        {NOTIF_ITEM_KEYS.map((item, i) => (
          <View key={i} style={notifStyles.listRow}>
            <View style={notifStyles.listIconWrap}>
              <Text style={notifStyles.listEmoji}>{item.emoji}</Text>
            </View>
            <Text style={notifStyles.listText}>{t(item.textKey)}</Text>
          </View>
        ))}
      </View>

      {/* CTA buttons */}
      <TouchableOpacity
        style={notifStyles.allowBtn}
        onPress={onAllow}
        disabled={loading}
        activeOpacity={0.85}
      >
        {loading
          ? <ActivityIndicator color="#fff" />
          : <Text style={notifStyles.allowBtnText}>{t('onb_notif_allow')}</Text>
        }
      </TouchableOpacity>

      <TouchableOpacity onPress={onSkip} activeOpacity={0.6} style={notifStyles.skipBtn}>
        <Text style={notifStyles.skipText}>{t('onb_later')}</Text>
      </TouchableOpacity>
    </View>
  )
}

const notifStyles = StyleSheet.create({
  wrap:        { alignItems: 'center', paddingTop: 16 },
  iconWrap:    {
    width: 80, height: 80, borderRadius: 24,
    backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center',
    marginBottom: 28,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07, shadowRadius: 8, elevation: 4,
  },
  iconEmoji:   { fontSize: 38 },
  title:       { textAlign: 'center', marginBottom: 8 },
  desc:        { textAlign: 'center', marginBottom: 28 },
  list:        {
    width: '100%', backgroundColor: colors.surface, borderRadius: 20, padding: 8,
    marginBottom: 32,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 4, elevation: 2,
  },
  listRow:     {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingVertical: 13, paddingHorizontal: 12,
  },
  listIconWrap:{
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center',
  },
  listEmoji:   { fontSize: 18 },
  listText:    { fontSize: 14, fontWeight: '500', color: colors.textPrimary, flex: 1, lineHeight: 20 },
  allowBtn:    {
    width: '100%', height: 56, borderRadius: 16,
    backgroundColor: colors.textPrimary, alignItems: 'center', justifyContent: 'center',
    marginBottom: 12,
  },
  allowBtnText:{ fontSize: 17, fontWeight: '700', color: '#fff', letterSpacing: -0.3 },
  skipBtn:     { paddingVertical: 10, paddingHorizontal: 20 },
  skipText:    { fontSize: 14, color: colors.textTertiary, fontWeight: '500' },
})

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  backBtnHidden: { opacity: 0 },
  backChevron: { fontSize: 28, color: colors.textPrimary, lineHeight: 32, fontWeight: '300' },
  dots: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { height: 6, borderRadius: 3 },
  dotActive: { width: 22, backgroundColor: colors.textPrimary },
  dotInactive: { width: 6, backgroundColor: colors.border },

  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 24, paddingBottom: 40 },

  step: { paddingTop: 32, gap: 0 },
  stepEyebrow: {
    fontSize: 11, fontWeight: '600', color: colors.textTertiary,
    letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8,
  },
  stepTitle: {
    fontSize: 28, fontWeight: '700', color: colors.textPrimary,
    letterSpacing: -0.6, marginBottom: 6,
  },
  stepDesc: {
    fontSize: 15, fontWeight: '400', color: colors.textSecondary,
    marginBottom: 36, lineHeight: 22,
  },

  // Gender
  genderRow: { flexDirection: 'row', gap: 12 },
  genderCard: {
    flex: 1, backgroundColor: colors.surface, borderRadius: 20,
    paddingVertical: 28, paddingHorizontal: 16, alignItems: 'center', gap: 6,
    borderWidth: 1.5, borderColor: colors.borderSoft,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  genderCardSelected: { borderColor: colors.textPrimary, borderWidth: 2 },
  genderLabel: { fontSize: 22, fontWeight: '700', color: colors.textSecondary, letterSpacing: -0.3 },
  genderLabelSelected: { color: colors.textPrimary },
  genderSub: { fontSize: 13, fontWeight: '400', color: colors.textTertiary },
  genderSubSelected: { color: colors.textSecondary },
  selectedBadge: {
    position: 'absolute', top: 12, right: 12,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: colors.textPrimary, alignItems: 'center', justifyContent: 'center',
  },
  selectedBadgeText: { fontSize: 11, fontWeight: '700', color: '#fff' },

  // Sliders
  sliderFieldLabel: {
    fontSize: 13, fontWeight: '600', color: colors.textTertiary,
    textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8,
  },
  bigNumRow: {
    flexDirection: 'row', alignItems: 'flex-end',
    marginBottom: 20,
  },
  bigNum: {
    fontSize: 80, fontWeight: '700', color: colors.textPrimary,
    letterSpacing: -3, lineHeight: 84,
  },
  bigNumUnit: {
    fontSize: 22, fontWeight: '500', color: colors.textSecondary,
    marginBottom: 10, marginLeft: 6,
  },
  sliderRange: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  sliderRangeLabel: { fontSize: 11, color: colors.textTertiary },
  divider: { height: 1, backgroundColor: colors.borderSoft, marginVertical: 32 },

  // Weight journey card
  weightJourneyCard: {
    backgroundColor: colors.surface, borderRadius: 20, padding: 24,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 28,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  weightJourneyItem: { alignItems: 'center', gap: 4 },
  weightJourneyLabel: { fontSize: 12, color: colors.textTertiary, fontWeight: '500' },
  weightJourneyNum: { fontSize: 34, fontWeight: '700', color: colors.textPrimary, letterSpacing: -0.5 },
  weightJourneyUnit: { fontSize: 16, fontWeight: '500', color: colors.textSecondary },
  weightJourneyTarget: { color: colors.mint },
  weightJourneyArrow: { alignItems: 'center', gap: 2 },
  weightJourneyArrowText: { fontSize: 24, color: colors.textTertiary },
  weightJourneyDiff: { fontSize: 12, fontWeight: '700', color: colors.mint },

  // Activity cards
  cardGroup: { gap: 12 },
  radioCard: {
    backgroundColor: colors.surface, borderRadius: 20, padding: 20,
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1.5, borderColor: colors.borderSoft,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 3, elevation: 1,
    gap: 14,
  },
  radioCardSelected: { borderColor: colors.textPrimary, borderWidth: 2 },
  radioCardEmoji: { fontSize: 26 },
  radioCardBody: { flex: 1, gap: 2 },
  radioCardTitle: { fontSize: 16, fontWeight: '600', color: colors.textPrimary },
  radioCardEn: { fontSize: 13, fontWeight: '400', color: colors.textTertiary },
  radioCardDesc: { fontSize: 13, color: colors.textSecondary },
  checkCircle: {
    width: 24, height: 24, borderRadius: 12,
    borderWidth: 1.5, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  checkCircleSelected: { backgroundColor: colors.textPrimary, borderColor: colors.textPrimary },
  checkMark: { fontSize: 12, fontWeight: '700', color: '#fff', lineHeight: 14 },

  // Plan
  planHero: {
    backgroundColor: colors.surface, borderRadius: 20, padding: 24,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 6, elevation: 3,
  },
  planHeroSide: { alignItems: 'center', gap: 4 },
  planHeroLabel: { fontSize: 11, color: colors.textTertiary, fontWeight: '500', textTransform: 'uppercase', letterSpacing: 0.3 },
  planHeroNum: { fontSize: 36, fontWeight: '700', color: colors.textPrimary, letterSpacing: -0.5 },
  planHeroUnit: { fontSize: 16, fontWeight: '500', color: colors.textSecondary },
  planHeroCenter: { alignItems: 'center', gap: 2 },
  planHeroMinus: { fontSize: 13, fontWeight: '700', color: colors.mint },
  planHeroArrow: { fontSize: 22, color: colors.textTertiary },
  planHeroDays: { fontSize: 11, color: colors.textTertiary, fontWeight: '500' },

  planRow: { flexDirection: 'row', gap: 12, marginBottom: 14 },
  planCard: {
    backgroundColor: colors.surface, borderRadius: 20, padding: 20, gap: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 3, elevation: 2,
  },
  planCardLabel: { fontSize: 11, color: colors.textTertiary, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3 },
  planCardValue: { fontSize: 26, fontWeight: '700', color: colors.textPrimary, letterSpacing: -0.5 },
  planCardSub: { fontSize: 12, color: colors.textSecondary },

  difficultyCard: {
    backgroundColor: colors.surface, borderRadius: 20, padding: 20, gap: 14,
    marginBottom: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 3, elevation: 2,
  },
  difficultyDesc: { fontSize: 14, fontWeight: '600', textAlign: 'center' },

  tipCard: {
    backgroundColor: colors.surface, borderRadius: 16, padding: 18,
    flexDirection: 'row', alignItems: 'flex-start', gap: 14, marginBottom: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
  },
  tipEmoji: { fontSize: 28, marginTop: 2 },
  tipBody: { flex: 1, gap: 4 },
  tipTitle: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
  tipDesc: { fontSize: 13, color: colors.textSecondary, lineHeight: 20 },
  tipHighlight: { fontWeight: '700', color: colors.textPrimary },

  catchphrase: { textAlign: 'center', marginTop: 16, marginBottom: 8 },
  catchphraseItalic: {
    fontSize: 14, fontStyle: 'italic', color: colors.textTertiary,
    fontWeight: '500', letterSpacing: -0.2,
  },

  // Bottom CTA
  bottomBar: {
    paddingHorizontal: 24, paddingTop: 12,
    backgroundColor: colors.background,
  },
  ctaBtn: {
    backgroundColor: colors.textPrimary,
    borderRadius: 16, height: 56,
    alignItems: 'center', justifyContent: 'center',
  },
  ctaBtnText: { fontSize: 17, fontWeight: '700', color: '#fff', letterSpacing: -0.3 },
})

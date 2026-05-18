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
import { colorsDark as colors } from '@repo/theme'
import type { BodyInfo, ActivityLevel, Gender } from '@repo/shared'
import { calculateCalorieGoal, calculateMacroGoals, calculateTDEE } from '@repo/shared'
import type { BuildBodyInfo } from '@repo/shared'
import { useAuthStore } from '../../store/auth'
import { requestNotificationPermission, scheduleAllNotifications } from '../../lib/notifications'

// 단계: 0닉네임 1성별 2키/나이 3활동량 4체중 5경력 6목표(bulk/cut/maintain) 7집중부위 8플랜요약 9알림
// regoal 모드: 활동량(3) → 체중(4) → 경력(5) → 목표(6) → 집중부위(7) → 플랜(8) → 알림(9)
const REGOAL_STEPS = [3, 4, 5, 6, 7, 8, 9]
const TOTAL_STEPS = 10

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets()
  const { setBodyInfo, setNickname, session, bodyInfo: existingBodyInfo } = useAuthStore()
  const params = useLocalSearchParams<{ mode?: string }>()
  const isRegoal = (Array.isArray(params.mode) ? params.mode[0] : params.mode) === 'regoal'

  // regoal 모드면 기존 bodyInfo 값으로 채워두고, 없으면 기본값
  const [step, setStep] = useState(() => isRegoal ? REGOAL_STEPS[0] : 0)
  const [notifLoading, setNotifLoading] = useState(false)
  const [nickname, setNicknameState] = useState('')
  const [form, setForm] = useState({
    gender: (existingBodyInfo?.gender ?? 'male') as Gender,
    height: existingBodyInfo?.height ?? 170,
    age: existingBodyInfo?.age ?? 28,
    weight: existingBodyInfo?.weight ?? 75,
    activity_level: (existingBodyInfo?.activity_level ?? 'moderate') as ActivityLevel,
    experience_level: 'beginner' as 'beginner' | 'intermediate' | 'advanced',
    split_type: 'full_body' as 'full_body' | 'upper_lower' | 'push_pull_legs' | 'bro_split',
    body_goal: 'bulk' as 'bulk' | 'cut' | 'maintain',
    focus_parts: [] as string[],
  })

  const update = useCallback((k: string, v: any) =>
    setForm((f) => ({ ...f, [k]: v })), [])

  const buildBodyInfo = (): BuildBodyInfo => ({
    user_id: session?.user?.id ?? '',
    height: form.height,
    weight: form.weight,
    age: form.age,
    gender: form.gender,
    goal: form.body_goal === 'cut' ? 'lose_weight' : form.body_goal === 'bulk' ? 'gain_muscle' : 'maintain',
    activity_level: form.activity_level,
    target_days: 84,
    exercise_minutes_per_day: 60,
    focus_parts: form.focus_parts,
    // BuildBodyInfo 전용
    build_goal: form.body_goal,
    experience_level: form.experience_level,
    split_type: form.split_type,
    training_days_per_week:
      form.split_type === 'full_body' ? 3
      : form.split_type === 'upper_lower' ? 4
      : form.split_type === 'push_pull_legs' ? 6
      : 5,
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
    } else if (step === 7) {
      if (form.focus_parts.length === 0) return
      setStep((s) => s + 1)
    } else if (step < 9) {
      setStep((s) => s + 1)
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
    router.replace('/paywall')
  }

  const handleNotifAllow = async () => {
    setNotifLoading(true)
    try {
      const granted = await requestNotificationPermission()
      if (granted) await scheduleAllNotifications(84)
    } finally {
      setNotifLoading(false)
      finishOnboarding()
    }
  }

  const handleNotifSkip = () => {
    finishOnboarding()
  }

  const isNotifStep = step === 9

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
        {step === 2 && <StepHeight form={form} onChange={update} />}
        {step === 3 && <StepActivity form={form} onChange={update} />}
        {step === 4 && <StepWeight form={form} onChange={update} />}
        {step === 5 && <StepExperience form={form} onChange={update} />}
        {step === 6 && <StepGoal form={form} onChange={update} />}
        {step === 7 && <StepFocusPart form={form} onChange={update} />}
        {step === 8 && <StepPlanSummary form={form} />}
        {step === 9 && (
          <StepNotification
            loading={notifLoading}
            onAllow={handleNotifAllow}
            onSkip={handleNotifSkip}
          />
        )}
      </ScrollView>

      {!isNotifStep && (
        <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 16 }]}>
          {(() => {
            const isFocusEmpty = step === 7 && form.focus_parts.length === 0
            const isNicknameEmpty = step === 0 && nickname.trim().length === 0
            const disabled = isFocusEmpty || isNicknameEmpty
            return (
              <TouchableOpacity
                style={[styles.ctaBtn, disabled && styles.ctaBtnDisabled]}
                onPress={handleNext}
                activeOpacity={disabled ? 1 : 0.85}
              >
                <Text style={styles.ctaBtnText}>
                  {isNicknameEmpty
                    ? '닉네임을 입력해주세요'
                    : isFocusEmpty
                      ? '부위를 1개 이상 선택해주세요'
                      : step === 8
                        ? '플랜 시작하기'
                        : '다음'}
                </Text>
              </TouchableOpacity>
            )
          })()}
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
      <Text style={styles.stepEyebrow}>Step 1 of 10</Text>
      <Text style={styles.stepTitle}>닉네임을 알려주세요</Text>
      <Text style={styles.stepDesc}>몸만들기는 나만의 여정이에요. 앱 안에서 쓸 이름이에요.</Text>
      <TextInput
        style={nickStyles.input}
        value={value}
        onChangeText={onChange}
        placeholder="닉네임 입력"
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
      <Text style={styles.stepEyebrow}>Step 2 of 10</Text>
      <Text style={styles.stepTitle}>성별을 알려주세요</Text>
      <Text style={styles.stepDesc}>정확한 단백질·칼로리 목표 계산에 필요해요</Text>

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
                {g === 'male' ? '남성' : '여성'}
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

      {form.gender === 'female' && (
        <View style={[styles.tipCard, { marginTop: 24 }]}>
          <Text style={styles.tipEmoji}>💡</Text>
          <View style={styles.tipBody}>
            <Text style={styles.tipTitle}>우락부락해지는 거 아닐까요?</Text>
            <Text style={styles.tipDesc}>
              걱정 마세요. 여성은 생물학적으로 남성처럼 근육이 크게 붙지 않아요.{'\n'}
              웨이트를 하면 탄탄한 라인과 힙업 효과가 생길 뿐이에요.
            </Text>
          </View>
        </View>
      )}
    </View>
  )
}

// ─── Step 2: Height + Age ─────────────────────────────────────────────────────

function StepHeight({ form, onChange }: any) {
  return (
    <View style={styles.step}>
      <Text style={styles.stepEyebrow}>Step 3 of 10</Text>
      <Text style={styles.stepTitle}>신체 정보</Text>
      <Text style={styles.stepDesc}>키와 나이를 알려주세요</Text>

      {/* Height */}
      <Text style={styles.sliderFieldLabel}>키</Text>
      <View style={styles.bigNumRow}>
        <Text style={styles.bigNum}>{form.height}</Text>
        <Text style={styles.bigNumUnit}>cm</Text>
      </View>
      <SliderTrack min={140} max={200} value={form.height} onValueChange={(v) => onChange('height', v)} />
      <View style={styles.sliderRange}>
        <Text style={styles.sliderRangeLabel}>140 cm</Text>
        <Text style={styles.sliderRangeLabel}>200 cm</Text>
      </View>

      <View style={styles.divider} />

      {/* Age */}
      <Text style={styles.sliderFieldLabel}>나이</Text>
      <View style={styles.bigNumRow}>
        <Text style={styles.bigNum}>{form.age}</Text>
        <Text style={styles.bigNumUnit}>세</Text>
      </View>
      <SliderTrack min={16} max={65} value={form.age} onValueChange={(v) => onChange('age', v)} />
      <View style={styles.sliderRange}>
        <Text style={styles.sliderRangeLabel}>16세</Text>
        <Text style={styles.sliderRangeLabel}>65세</Text>
      </View>
    </View>
  )
}

// ─── Step 4: Weight ───────────────────────────────────────────────────────────

function StepWeight({ form, onChange }: any) {
  // 단백질 배율은 목표 선택 후 확정 — 여기서는 중간값(2.0)으로 미리보기
  const proteinPreview = Math.round(form.weight * 2.0)

  return (
    <View style={[styles.step, { paddingTop: 16 }]}>
      <Text style={styles.stepEyebrow}>Step 5 of 10</Text>
      <Text style={styles.stepTitle}>현재 체중</Text>
      <Text style={[styles.stepDesc, { marginBottom: 14 }]}>
        정확한 단백질 목표 계산에 사용돼요
      </Text>

      {/* Protein goal preview */}
      <View style={[styles.weightJourneyCard, { marginBottom: 16, paddingVertical: 18 }]}>
        <View style={styles.weightJourneyItem}>
          <Text style={styles.weightJourneyLabel}>단백질 목표</Text>
          <Text style={[styles.weightJourneyNum, { color: colors.mint }]}>
            ~{proteinPreview}<Text style={[styles.weightJourneyUnit, { color: colors.mint }]}>g</Text>
          </Text>
        </View>
        <View style={styles.weightJourneyArrow}>
          <Text style={[styles.weightJourneyArrowText, { fontSize: 14, color: colors.textTertiary }]}>≈</Text>
          <Text style={[styles.weightJourneyDiff, { color: colors.textTertiary, fontSize: 11 }]}>
            체중 × 2.0
          </Text>
        </View>
        <View style={styles.weightJourneyItem}>
          <Text style={styles.weightJourneyLabel}>목표 확정 후</Text>
          <Text style={[styles.weightJourneyNum, { fontSize: 18 }]}>
            <Text style={[styles.weightJourneyUnit, { fontSize: 13 }]}>조정됨</Text>
          </Text>
        </View>
      </View>

      {/* Current weight */}
      <Text style={styles.sliderFieldLabel}>현재 체중</Text>
      <View style={[styles.bigNumRow, { marginBottom: 8 }]}>
        <Text style={[styles.bigNum, { fontSize: 60, lineHeight: 64 }]}>{form.weight}</Text>
        <Text style={styles.bigNumUnit}>kg</Text>
      </View>
      <SliderTrack
        min={40} max={130} value={form.weight}
        onValueChange={(v) => onChange('weight', v)}
      />
      <View style={[styles.sliderRange, { marginTop: 4 }]}>
        <Text style={styles.sliderRangeLabel}>40 kg</Text>
        <Text style={styles.sliderRangeLabel}>130 kg</Text>
      </View>

      <View style={[styles.divider, { marginVertical: 14 }]} />

      {/* 체중 변화 안내 */}
      <View style={styles.tipCard}>
        <Text style={styles.tipEmoji}>📈</Text>
        <View style={styles.tipBody}>
          <Text style={styles.tipTitle}>체중보다 체형이 바뀌어요</Text>
          <Text style={styles.tipDesc}>
            증량 시 주당 <Text style={styles.tipHighlight}>0.5kg 증가</Text>가 이상적이에요.{'\n'}
            감량 시 주당 <Text style={styles.tipHighlight}>0.5kg 감소</Text>로 근육을 지켜요.{'\n'}
            숫자보다 거울 속 변화를 믿으세요.
          </Text>
        </View>
      </View>
    </View>
  )
}

// ─── Step 4: Activity ─────────────────────────────────────────────────────────

const ACTIVITY_LEVELS: { value: ActivityLevel; ko: string; en: string; desc: string; emoji: string }[] = [
  { value: 'sedentary',   ko: '낮음', en: 'Low',    emoji: '🪑', desc: '주로 앉아서 생활해요' },
  { value: 'moderate',    ko: '보통', en: 'Medium', emoji: '🚶', desc: '주 3~5회 운동해요' },
  { value: 'very_active', ko: '높음', en: 'High',   emoji: '🏃', desc: '매일 활발하게 움직여요' },
]

function StepActivity({ form, onChange }: any) {
  return (
    <View style={styles.step}>
      <Text style={styles.stepEyebrow}>Step 4 of 10</Text>
      <Text style={styles.stepTitle}>평소 활동량</Text>
      <Text style={styles.stepDesc}>헬스 외 일상 활동 기준이에요. 단백질 목표 계산에 반영돼요.</Text>

      <View style={styles.cardGroup}>
        {ACTIVITY_LEVELS.map((a) => {
          const selected = form.activity_level === a.value
          return (
            <TouchableOpacity
              key={a.value}
              style={[styles.radioCard, selected && styles.radioCardSelected]}
              onPress={() => onChange('activity_level', a.value)}
              activeOpacity={0.8}
            >
              <Text style={styles.radioCardEmoji}>{a.emoji}</Text>
              <View style={styles.radioCardBody}>
                <Text style={styles.radioCardTitle}>{a.ko} <Text style={styles.radioCardEn}>{a.en}</Text></Text>
                <Text style={styles.radioCardDesc}>{a.desc}</Text>
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

// ─── Step 5: Experience Level ─────────────────────────────────────────────────

const EXPERIENCE_OPTIONS = [
  {
    value: 'beginner' as const,
    ko: '헬스장이 처음이에요',
    en: 'Beginner',
    emoji: '🌱',
    desc: '운동 방법을 잘 몰라도 괜찮아요\n앱이 처음부터 알려줄게요',
  },
  {
    value: 'intermediate' as const,
    ko: '다녀본 적은 있어요',
    en: 'Intermediate',
    emoji: '💪',
    desc: '기본 운동은 알지만 제대로 된\n프로그램이 없었어요',
  },
  {
    value: 'advanced' as const,
    ko: '꾸준히 해왔어요',
    en: 'Advanced',
    emoji: '🔥',
    desc: '스스로 운동하고 있지만\n더 체계적으로 하고 싶어요',
  },
]

const EXPERIENCE_TO_SPLIT: Record<string, 'full_body' | 'upper_lower' | 'push_pull_legs' | 'bro_split'> = {
  beginner: 'full_body',
  intermediate: 'upper_lower',
  advanced: 'push_pull_legs',
}

function StepExperience({ form, onChange }: any) {
  const tipMap = {
    beginner:     { title: '주 3일 Full Body', desc: '전신을 고루 자극하는 루틴으로\n근신경 발달에 집중해요.' },
    intermediate: { title: '주 4일 상하체 분할', desc: '상체/하체를 번갈아 훈련해\n볼륨과 강도를 높여요.' },
    advanced:     { title: '주 6일 PPL', desc: '밀기/당기기/하체를 번갈아\n근비대를 극대화해요.' },
  }
  const tip = tipMap[form.experience_level as keyof typeof tipMap]

  const handleSelectExperience = (level: string) => {
    onChange('experience_level', level)
    const autoSplit = EXPERIENCE_TO_SPLIT[level]
    if (autoSplit) onChange('split_type', autoSplit)
  }

  return (
    <View style={styles.step}>
      <Text style={styles.stepEyebrow}>Step 6 of 10</Text>
      <Text style={styles.stepTitle}>운동 경험</Text>
      <Text style={styles.stepDesc}>
        솔직하게 골라주세요.{'\n'}딱 맞는 프로그램을 처방해줄게요.
      </Text>

      <View style={styles.cardGroup}>
        {EXPERIENCE_OPTIONS.map((opt) => {
          const isSelected = form.experience_level === opt.value
          return (
            <TouchableOpacity
              key={opt.value}
              style={[styles.radioCard, isSelected && styles.radioCardSelected]}
              onPress={() => handleSelectExperience(opt.value)}
              activeOpacity={0.8}
            >
              <Text style={styles.radioCardEmoji}>{opt.emoji}</Text>
              <View style={styles.radioCardBody}>
                <Text style={styles.radioCardTitle}>
                  {opt.ko} <Text style={styles.radioCardEn}>{opt.en}</Text>
                </Text>
                <Text style={styles.radioCardDesc}>{opt.desc}</Text>
              </View>
              <View style={[styles.checkCircle, isSelected && styles.checkCircleSelected]}>
                {isSelected && <Text style={styles.checkMark}>✓</Text>}
              </View>
            </TouchableOpacity>
          )
        })}
      </View>

      <View style={[styles.tipCard, { marginTop: 16 }]}>
        <Text style={styles.tipEmoji}>🗓</Text>
        <View style={styles.tipBody}>
          <Text style={styles.tipTitle}>{tip.title}</Text>
          <Text style={styles.tipDesc}>{tip.desc}</Text>
        </View>
      </View>
    </View>
  )
}

const GOAL_OPTIONS = [
  { value: 'bulk' as const,     ko: '증량 Bulk',    emoji: '📈', desc: '근육 키우기 · 칼로리 잉여' },
  { value: 'cut' as const,      ko: '감량 Cut',     emoji: '📉', desc: '체지방 제거 · 칼로리 적자' },
  { value: 'maintain' as const, ko: '유지 Maintain', emoji: '⚖️', desc: '현상 유지 · 리컴프' },
]

// ─── Step 6: Body Goal ────────────────────────────────────────────────────────

function StepGoal({ form, onChange }: any) {
  const proteinRatioByLevel: Record<string, number> = { beginner: 1.6, intermediate: 2.0, advanced: 2.2 }
  const surplusMap = { bulk: '+300', cut: '-500', maintain: '±0' }
  const selectedGoal = form.body_goal as 'bulk' | 'cut' | 'maintain'
  const proteinGoal = Math.round(form.weight * (proteinRatioByLevel[form.experience_level as string] ?? 2.0))

  const goalColor = selectedGoal === 'bulk' ? '#FF9500' : selectedGoal === 'cut' ? colors.mint : '#30D158'

  return (
    <View style={styles.step}>
      <Text style={styles.stepEyebrow}>Step 7 of 10</Text>
      <Text style={styles.stepTitle}>지금 목표</Text>
      <Text style={styles.stepDesc}>
        목표에 따라 단백질·칼로리 플랜이 달라져요.
      </Text>

      <View style={splitStyles.goalRow}>
        {GOAL_OPTIONS.map((opt) => {
          const isSelected = form.body_goal === opt.value
          return (
            <TouchableOpacity
              key={opt.value}
              style={[splitStyles.goalCard, isSelected && splitStyles.goalCardSelected]}
              onPress={() => onChange('body_goal', opt.value)}
              activeOpacity={0.8}
            >
              <Text style={splitStyles.goalEmoji}>{opt.emoji}</Text>
              <Text style={[splitStyles.goalKo, isSelected && splitStyles.goalKoSelected]}>{opt.ko}</Text>
              <Text style={splitStyles.goalDesc}>{opt.desc}</Text>
            </TouchableOpacity>
          )
        })}
      </View>

      {/* 선택된 목표의 단백질/칼로리 프리뷰 */}
      <View style={[styles.tipCard, { marginTop: 20 }]}>
        <Text style={styles.tipEmoji}>🥩</Text>
        <View style={styles.tipBody}>
          <Text style={styles.tipTitle}>
            {selectedGoal === 'bulk' ? '증량 플랜' : selectedGoal === 'cut' ? '감량 플랜' : '유지 플랜'}
          </Text>
          <Text style={styles.tipDesc}>
            단백질 <Text style={[styles.tipHighlight, { color: goalColor }]}>{proteinGoal}g</Text> / 일{'\n'}
            칼로리 조정 <Text style={styles.tipHighlight}>{surplusMap[selectedGoal]} kcal</Text>
          </Text>
        </View>
      </View>
    </View>
  )
}

// ─── Step 8: Focus Body Part ──────────────────────────────────────────────────

const FOCUS_PARTS_MALE = [
  { value: 'chest',      ko: '가슴',   emoji: '🫀' },
  { value: 'back',       ko: '등',     emoji: '🏔' },
  { value: 'shoulders',  ko: '어깨',   emoji: '🎯' },
  { value: 'arms',       ko: '팔',     emoji: '💪' },
  { value: 'legs',       ko: '하체',   emoji: '🦵' },
  { value: 'abs',        ko: '복근',   emoji: '🔲' },
]

const FOCUS_PARTS_FEMALE = [
  { value: 'glutes',     ko: '힙/둔근', emoji: '🍑' },
  { value: 'legs',       ko: '허벅지',  emoji: '🦵' },
  { value: 'abs',        ko: '복근',    emoji: '🔲' },
  { value: 'arms',       ko: '팔뚝 라인', emoji: '💪' },
  { value: 'back',       ko: '등',      emoji: '🏔' },
  { value: 'shoulders',  ko: '어깨',    emoji: '🎯' },
]

function StepFocusPart({ form, onChange }: any) {
  const isFemale = form.gender === 'female'
  const parts = isFemale ? FOCUS_PARTS_FEMALE : FOCUS_PARTS_MALE
  const selected: string[] = form.focus_parts

  const toggle = (value: string) => {
    const idx = selected.indexOf(value)
    if (idx !== -1) {
      // 선택 해제 — 해당 항목 제거, 뒤 순위들 앞으로 당겨짐
      onChange('focus_parts', selected.filter((v) => v !== value))
    } else {
      // 순위 추가 — 6개까지
      if (selected.length < 6) {
        onChange('focus_parts', [...selected, value])
      }
    }
  }

  return (
    <View style={styles.step}>
      <Text style={styles.stepEyebrow}>Step 8 of 10</Text>
      <Text style={styles.stepTitle}>
        {isFemale ? '어디를 만들고 싶어요?' : '어디를 키우고 싶어요?'}
      </Text>
      <Text style={styles.stepDesc}>
        우선순위 순서대로 눌러주세요.{'\n'}1순위부터 최대 6순위까지 선택할 수 있어요.
      </Text>

      <View style={focusStyles.grid}>
        {parts.map((part) => {
          const rank = selected.indexOf(part.value) // -1이면 미선택
          const isSelected = rank !== -1
          return (
            <TouchableOpacity
              key={part.value}
              style={[
                focusStyles.card,
                isSelected && focusStyles.cardSelected,
              ]}
              onPress={() => toggle(part.value)}
              activeOpacity={0.8}
            >
              <Text style={focusStyles.cardEmoji}>{part.emoji}</Text>
              <Text style={[focusStyles.cardLabel, isSelected && focusStyles.cardLabelSelected]}>
                {part.ko}
              </Text>
              {isSelected && (
                <View style={focusStyles.checkBadge}>
                  <Text style={focusStyles.checkBadgeText}>{rank + 1}</Text>
                </View>
              )}
            </TouchableOpacity>
          )
        })}
      </View>

      <View style={[styles.tipCard, { marginTop: 8 }]}>
        <Text style={styles.tipEmoji}>🏋️</Text>
        <View style={styles.tipBody}>
          <Text style={styles.tipTitle}>집중 공략 + 균형 유지</Text>
          <Text style={styles.tipDesc}>
            선택한 부위 볼륨을 높이되,{'\n'}다른 부위도 함께 자극해야 더 잘 커요.
          </Text>
        </View>
      </View>
    </View>
  )
}

const focusStyles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },
  card: {
    width: '30%',
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 10,
    alignItems: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderColor: colors.borderSoft,
    position: 'relative',
  },
  cardSelected: {
    borderColor: colors.mint,
    borderWidth: 2,
    backgroundColor: `${colors.mint}10`,
  },
  cardDisabled: {
    opacity: 0.35,
  },
  cardEmoji: { fontSize: 28 },
  cardLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    textAlign: 'center',
  },
  cardLabelSelected: { color: colors.mint },
  checkBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.mint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkBadgeText: { fontSize: 10, fontWeight: '700', color: '#fff' },
})

const splitStyles = StyleSheet.create({
  daysBadge: {
    backgroundColor: colors.background, borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 4,
    borderWidth: 1, borderColor: colors.borderSoft,
  },
  daysBadgeText: { fontSize: 11, fontWeight: '600', color: colors.textTertiary },
  goalRow: { flexDirection: 'row', gap: 10 },
  goalCard: {
    flex: 1, backgroundColor: colors.surface, borderRadius: 16, padding: 14,
    alignItems: 'center', gap: 6,
    borderWidth: 1.5, borderColor: colors.borderSoft,
  },
  goalCardSelected: { borderColor: colors.mint, borderWidth: 2 },
  goalEmoji: { fontSize: 22 },
  goalKo: { fontSize: 13, fontWeight: '700', color: colors.textSecondary, textAlign: 'center' },
  goalKoSelected: { color: colors.mint },
  goalDesc: { fontSize: 10, color: colors.textTertiary, textAlign: 'center', lineHeight: 14 },
})

// ─── Step 7: Plan Summary ─────────────────────────────────────────────────────

const GOAL_KO: Record<string, string> = {
  bulk: '증량',
  cut: '감량',
  maintain: '유지',
}

const PLAN_RESULTS: Record<string, { changes: { emoji: string; text: string }[]; quote: string }> = {
  bulk: {
    changes: [
      { emoji: '💪', text: '근육량 2-3kg 증가' },
      { emoji: '🏋️', text: '주요 리프트 20-30% 향상' },
      { emoji: '📐', text: '어깨·가슴·등 눈에 띄게 변화' },
      { emoji: '⚡', text: '일상 체력·에너지 레벨 상승' },
    ],
    quote: '12주면 거울 앞에서 달라진 내가 보여요.',
  },
  cut: {
    changes: [
      { emoji: '🔥', text: '체지방 3-4kg 감소' },
      { emoji: '💪', text: '근육은 유지하며 선명한 라인' },
      { emoji: '⚖️', text: '기초대사량 유지로 요요 없음' },
      { emoji: '⚡', text: '몸이 가벼워지고 체력 향상' },
    ],
    quote: '12주면 옷 핏이 완전히 달라져요.',
  },
  maintain: {
    changes: [
      { emoji: '🏗️', text: '근육·지방 비율 리컴프' },
      { emoji: '💪', text: '전신 근력 균형 있게 향상' },
      { emoji: '🪞', text: '체중 유지하며 체형 변화' },
      { emoji: '⚡', text: '운동 습관 완성' },
    ],
    quote: '12주면 체형이 바뀌는 걸 느껴요.',
  },
}

function StepPlanSummary({ form }: any) {
  const proteinRatioByLevel: Record<string, number> = { beginner: 1.6, intermediate: 2.0, advanced: 2.2 }
  const proteinGoal = Math.round(form.weight * (proteinRatioByLevel[form.experience_level as string] ?? 2.0))

  const goalColor = form.body_goal === 'bulk' ? '#FF9500' : form.body_goal === 'cut' ? colors.mint : '#30D158'
  const result = PLAN_RESULTS[form.body_goal as keyof typeof PLAN_RESULTS] ?? PLAN_RESULTS.bulk

  return (
    <View style={styles.step}>
      <Text style={styles.stepEyebrow}>나의 플랜</Text>
      <Text style={styles.stepTitle}>12주 후{'\n'}이렇게 바뀌어요</Text>
      <Text style={styles.stepDesc}>
        {GOAL_KO[form.body_goal]} · 12주 프로그램
      </Text>

      {/* 12주 후 변화 카드 */}
      <View style={[styles.planCard, { marginBottom: 14 }]}>
        {result.changes.map((item, i) => (
          <View key={i} style={summaryStyles.changeRow}>
            <Text style={summaryStyles.changeEmoji}>{item.emoji}</Text>
            <Text style={summaryStyles.changeText}>{item.text}</Text>
          </View>
        ))}
      </View>

      {/* 처방 핵심 */}
      <View style={styles.planRow}>
        <View style={[styles.planCard, { flex: 1 }]}>
          <Text style={styles.planCardLabel}>매일 단백질</Text>
          <Text style={[styles.planCardValue, { color: goalColor }]}>{proteinGoal}g</Text>
          <Text style={styles.planCardSub}>체중 × 2.2</Text>
        </View>
        <View style={[styles.planCard, { flex: 1 }]}>
          <Text style={styles.planCardLabel}>프로그램</Text>
          <Text style={styles.planCardValue}>12주</Text>
          <Text style={styles.planCardSub}>AI 트레이너 처방</Text>
        </View>
      </View>

      {/* 코치 멘트 */}
      <View style={styles.tipCard}>
        <Text style={styles.tipEmoji}>🧑‍💼</Text>
        <View style={styles.tipBody}>
          <Text style={styles.tipTitle}>코치 한마디</Text>
          <Text style={styles.tipDesc}>{result.quote}{'\n'}매일 기록만 하면 나머지는 제가 처방할게요.</Text>
        </View>
      </View>

      <Text style={styles.catchphrase}>
        <Text style={styles.catchphraseItalic}>Build your body. 12 weeks.</Text>
      </Text>
    </View>
  )
}

const summaryStyles = StyleSheet.create({
  changeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  changeEmoji: { fontSize: 20, width: 28, textAlign: 'center' },
  changeText: { fontSize: 15, fontWeight: '600', color: colors.textPrimary, flex: 1 },
})

// ─── Step 8: Notification Permission ─────────────────────────────────────────

const NOTIF_ITEMS = [
  { emoji: '🏋️', text: '오늘 운동 부위 & 루틴 알림 (매일 17:30)' },
  { emoji: '⏱', text: '세트 간 휴식 타이머 완료 알림' },
  { emoji: '🥩', text: '단백질 부족 시 식단 보충 알림' },
  { emoji: '📏', text: '주 1회 체중·신체 측정 리마인더' },
  { emoji: '🔥', text: '주간 볼륨 달성 & 스트릭 알림' },
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

      <Text style={[styles.stepTitle, notifStyles.title]}>
        꼭 필요한 순간에만{'\n'}알려드려요
      </Text>
      <Text style={[styles.stepDesc, notifStyles.desc]}>
        코치가 딱 맞는 타이밍에 보내드려요
      </Text>

      {/* Notification list */}
      <View style={notifStyles.list}>
        {NOTIF_ITEMS.map((item, i) => (
          <View key={i} style={notifStyles.listRow}>
            <View style={notifStyles.listIconWrap}>
              <Text style={notifStyles.listEmoji}>{item.emoji}</Text>
            </View>
            <Text style={notifStyles.listText}>{item.text}</Text>
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
          : <Text style={notifStyles.allowBtnText}>알림 받기</Text>
        }
      </TouchableOpacity>

      <TouchableOpacity onPress={onSkip} activeOpacity={0.6} style={notifStyles.skipBtn}>
        <Text style={notifStyles.skipText}>나중에</Text>
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
    backgroundColor: colors.mint, alignItems: 'center', justifyContent: 'center',
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
    backgroundColor: colors.mint,
    borderRadius: 16, height: 56,
    alignItems: 'center', justifyContent: 'center',
  },
  ctaBtnDisabled: { backgroundColor: colors.borderSoft },
  ctaBtnText: { fontSize: 17, fontWeight: '700', color: '#fff', letterSpacing: -0.3 },
})

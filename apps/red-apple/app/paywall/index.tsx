import { useState, useRef, useEffect } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Alert,
  ActivityIndicator,
  ScrollView,
  Modal,
  Dimensions,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colorsDark as colors } from '@repo/theme'
import { useAuthStore, type PlanType } from '../../store/auth'
import { supabase } from '../../lib/supabase'
import { purchasePlan, restorePurchases, getOfferings, PRODUCT_IDS } from '../../lib/iap'

const { width: SCREEN_WIDTH } = Dimensions.get('window')

type Feature = { icon: string; text: string }

const PLAN_EMOJI = {
  'monthly': '💪',
  'yearly':  '🔥',
} as const

const PLANS: {
  id: PlanType
  period: string
  periodSub: string
  price: string
  priceMonthly: string
  originalPrice?: string
  analogy: string
  analogySub: string
  badge?: string
  hint: string
  coachExample: string
  features: Feature[]
}[] = [
  {
    id: 'monthly',
    period: '월간',
    periodSub: '매월 자동 갱신',
    price: '₩19,900/월',
    priceMonthly: '₩19,900',
    analogy: 'PT 1회의',
    analogySub: ' 1/3 가격',
    hint: '14일 무료 체험 후 매월 결제돼요.\n언제든 취소할 수 있어요.',
    coachExample: '"오늘 볼륨 8,400kg 달성 🔥 — 내일 하체 집중하면 좋아요"',
    features: [
      { icon: '🥩', text: '단백질 분석' },
      { icon: '🏋️', text: '운동 처방' },
      { icon: '🤖', text: 'AI 코치' },
      { icon: '🔔', text: '목표 알림' },
    ],
  },
  {
    id: 'yearly',
    period: '연간',
    periodSub: '월 ₩8,250 · 59% 할인',
    price: '₩99,000/년',
    priceMonthly: '₩8,250',
    originalPrice: '₩238,800',
    analogy: 'PT 1회보다',
    analogySub: ' 저렴하게',
    badge: '최대 할인',
    hint: '14일 무료 체험 후 연 1회 결제돼요.\n12주 완료 후 다음 사이클 바로 시작.',
    coachExample: '"연간 플랜 — Bulk → Cut 사이클 제한 없이 🏆"',
    features: [
      { icon: '🔥', text: '59% 할인' },
      { icon: '🥩', text: '단백질 분석' },
      { icon: '🏋️', text: '운동 처방' },
      { icon: '🤖', text: 'AI 코치' },
    ],
  },
]

// ─── Feature Detail Data ──────────────────────────────────────────────────────

type FeatureDetail = {
  icon: string
  title: string
  subtitle: string
  bullets: { emoji: string; text: string }[]
}

const FEATURE_DETAILS: Record<string, FeatureDetail> = {
  'AI 코치': {
    icon: '🤖',
    title: 'AI 코치',
    subtitle: '매일 상황에 맞는 피드백',
    bullets: [
      { emoji: '📊', text: '어제 단백질·볼륨 기반으로 오늘 식단·운동 목표 자동 조정' },
      { emoji: '🔄', text: '주간 볼륨 누적을 계산해 남은 기간 목표를 재설정' },
      { emoji: '💬', text: '식사 기록 후 즉시 단백질 보충 가이드 알림 발송' },
      { emoji: '🎯', text: '단백질 목표 85% 이상이면 "오늘 클린벌크 성공" 확인 알림' },
    ],
  },
  '단백질 분석': {
    icon: '🥩',
    title: '단백질 분석',
    subtitle: '사진 한 장으로 단백질·매크로 끝',
    bullets: [
      { emoji: '📷', text: '음식 사진을 찍으면 AI가 단백질·탄수화물·지방 자동 인식' },
      { emoji: '✏️', text: '텍스트로 입력해도 AI가 영양소를 추정' },
      { emoji: '🥩', text: '끼니별 단백질 목표 배분 및 달성률 표시' },
      { emoji: '⚠️', text: '단백질 미달 시 즉시 보충 알림 발송' },
    ],
  },
  '운동 처방': {
    icon: '🏋️',
    title: '운동 처방',
    subtitle: '분할 방식에 맞게 오늘 부위 확정',
    bullets: [
      { emoji: '🗓️', text: '선택한 분할(Full Body/상하체/PPL/브로스플릿)에 따라 오늘 부위 자동 배정' },
      { emoji: '💀', text: '근육 인체 맵 터치 → 운동 목록 → 세트/무게/횟수 기록' },
      { emoji: '📈', text: '주간 볼륨(kg) 성장 그래프로 점진적 과부하 확인' },
      { emoji: '✅', text: '목표 볼륨 달성하면 운동 리마인더 알림 자동 취소' },
    ],
  },
  '볼륨 트래킹': {
    icon: '📊',
    title: '볼륨 트래킹',
    subtitle: '세트×무게×횟수, 흐름을 봐요',
    bullets: [
      { emoji: '📅', text: '주 단위 볼륨 누적 — 지난 주 대비 성장률 표시' },
      { emoji: '📈', text: '시작 대비 현재 근육량 증가 추정치 실시간 표시' },
      { emoji: '🏁', text: '12주 종료 시 전체 볼륨 성장 리포트 제공' },
      { emoji: '💪', text: '부위별 강점·약점 분석으로 다음 사이클 자동 설계' },
    ],
  },
  '목표 알림': {
    icon: '🔔',
    title: '목표 알림',
    subtitle: '잊지 않게, 딱 필요할 때만',
    bullets: [
      { emoji: '🌅', text: '매일 아침 오늘 운동 부위 + 단백질 목표 알림' },
      { emoji: '🥩', text: '끼니 시간대별 단백질 리마인더 (아침·점심·저녁)' },
      { emoji: '💪', text: '오후 5:30 운동 리마인더 — 오늘 이미 했으면 취소' },
      { emoji: '🔁', text: '48시간 미접속 시 이탈 방지 알림' },
    ],
  },
  '3사이클 이용권': {
    icon: '🔥',
    title: '3사이클 이용권',
    subtitle: '한 번 사면 세 사이클을 써요',
    bullets: [
      { emoji: '🎟️', text: 'Bulk → Cut → 유지 — 3사이클 기간 상관없이 꺼내 쓰기' },
      { emoji: '💰', text: '1사이클당 ₩6,633 — 12주 플랜 대비 33% 저렴' },
      { emoji: '🔄', text: '사이클 완료 후 새 목표(분할/목표)로 즉시 재시작' },
      { emoji: '📦', text: '재구매 시 잔여 횟수 자동 누적' },
    ],
  },
}

// ─── Feature Detail Modal ─────────────────────────────────────────────────────

function FeatureDetailModal({ feature, onClose }: { feature: FeatureDetail | null; onClose: () => void }) {
  const translateY = useRef(new Animated.Value(300)).current
  const opacity    = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (feature) {
      translateY.setValue(300)
      opacity.setValue(0)
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
        Animated.spring(translateY, { toValue: 0, useNativeDriver: true, damping: 22, stiffness: 200 }),
      ]).start()
    }
  }, [feature])

  const handleClose = () => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 0, duration: 160, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 300, duration: 200, useNativeDriver: true }),
    ]).start(() => onClose())
  }

  if (!feature) return null

  return (
    <Modal visible={!!feature} transparent animationType="none" onRequestClose={handleClose}>
      <Animated.View style={[modalStyles.overlay, { opacity }]}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={handleClose} />
        <Animated.View style={[modalStyles.sheet, { transform: [{ translateY }] }]}>
          <View style={modalStyles.handle} />
          <Text style={modalStyles.icon}>{feature.icon}</Text>
          <Text style={modalStyles.title}>{feature.title}</Text>
          <Text style={modalStyles.subtitle}>{feature.subtitle}</Text>
          <View style={modalStyles.bullets}>
            {feature.bullets.map((b, i) => (
              <View key={i} style={modalStyles.bulletRow}>
                <Text style={modalStyles.bulletEmoji}>{b.emoji}</Text>
                <Text style={modalStyles.bulletText}>{b.text}</Text>
              </View>
            ))}
          </View>
          <TouchableOpacity style={modalStyles.closeBtn} onPress={handleClose} activeOpacity={0.8}>
            <Text style={modalStyles.closeBtnText}>닫기</Text>
          </TouchableOpacity>
        </Animated.View>
      </Animated.View>
    </Modal>
  )
}

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: 24, paddingTop: 12, paddingBottom: 36, alignItems: 'center',
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.borderSoft, marginBottom: 20 },
  icon: { fontSize: 48, marginBottom: 8 },
  title: { fontSize: 22, fontWeight: '700', color: colors.textPrimary, letterSpacing: -0.5 },
  subtitle: { fontSize: 14, color: colors.textSecondary, marginTop: 4, marginBottom: 20 },
  bullets: { alignSelf: 'stretch', gap: 12, marginBottom: 24 },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  bulletEmoji: { fontSize: 18, lineHeight: 24 },
  bulletText: { flex: 1, fontSize: 14, color: colors.textPrimary, lineHeight: 22 },
  closeBtn: {
    backgroundColor: '#FF3B30', borderRadius: 14,
    height: 50, width: '100%', alignItems: 'center', justifyContent: 'center',
  },
  closeBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
})

// ─── Animated Plan Card ───────────────────────────────────────────────────────

function PlanCard({
  plan,
  isSelected,
  onSelect,
}: {
  plan: typeof PLANS[0]
  isSelected: boolean
  onSelect: () => void
}) {
  const scale = useRef(new Animated.Value(1)).current
  const emojiScale = useRef(new Animated.Value(1)).current
  const borderAnim = useRef(new Animated.Value(isSelected ? 1 : 0)).current

  useEffect(() => {
    Animated.timing(borderAnim, {
      toValue: isSelected ? 1 : 0,
      duration: 200,
      useNativeDriver: false,
    }).start()

    if (isSelected) {
      Animated.sequence([
        Animated.spring(emojiScale, { toValue: 1.35, useNativeDriver: true, speed: 40, bounciness: 14 }),
        Animated.spring(emojiScale, { toValue: 1, useNativeDriver: true, speed: 30, bounciness: 8 }),
      ]).start()
    }
  }, [isSelected])

  const handlePressIn = () =>
    Animated.spring(scale, { toValue: 0.95, useNativeDriver: true, speed: 50, bounciness: 0 }).start()
  const handlePressOut = () =>
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 30, bounciness: 10 }).start()

  const borderColor = borderAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.borderSoft, colors.textPrimary],
  })
  const borderWidth = borderAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1.5, 2.5],
  })

  return (
    <TouchableOpacity
      style={styles.planCardWrap}
      onPress={onSelect}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      activeOpacity={1}
    >
      <Animated.View style={{ transform: [{ scale }] }}>
        <Animated.View style={[styles.planCard, { borderColor, borderWidth }]}>
          {plan.badge && (
            <View style={styles.popularBadge}>
              <Text style={styles.popularBadgeText}>{plan.badge}</Text>
            </View>
          )}

          <Text style={[styles.planPeriod, isSelected && styles.planPeriodSelected]}>
            {plan.period}
          </Text>
          <Text style={styles.planPeriodSub}>{plan.periodSub}</Text>

          <Animated.View style={{ transform: [{ scale: emojiScale }] }}>
            <Text style={styles.planEmoji}>{PLAN_EMOJI[plan.id as keyof typeof PLAN_EMOJI]}</Text>
          </Animated.View>

          {plan.originalPrice && (
            <Text style={styles.planOriginalPrice}>{plan.originalPrice}</Text>
          )}
          <Text style={[styles.planPrice, isSelected && styles.planPriceSelected]}>
            {plan.price}
          </Text>
        </Animated.View>
      </Animated.View>
    </TouchableOpacity>
  )
}

// ─── Feature Card (plan-specific) ────────────────────────────────────────────

function FeatureCard({ selectedPlan, onPressFeature }: {
  selectedPlan: typeof PLANS[0]
  onPressFeature: (key: string) => void
}) {
  const heroScale   = useRef(new Animated.Value(1)).current
  const heroOpacity = useRef(new Animated.Value(1)).current
  const breathe     = useRef(new Animated.Value(1)).current
  const prevId      = useRef(selectedPlan.id)
  const [planId, setPlanId] = useState(selectedPlan.id)

  const shownPlan = PLANS.find((p) => p.id === planId) ?? selectedPlan

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, { toValue: 1.18, duration: 1200, useNativeDriver: true }),
        Animated.timing(breathe, { toValue: 1,    duration: 1200, useNativeDriver: true }),
      ])
    )
    loop.start()
    return () => loop.stop()
  }, [])

  useEffect(() => {
    if (selectedPlan.id === prevId.current) return
    Animated.parallel([
      Animated.timing(heroOpacity, { toValue: 0,   duration: 100, useNativeDriver: true }),
      Animated.timing(heroScale,   { toValue: 0.7, duration: 100, useNativeDriver: true }),
    ]).start(() => {
      setPlanId(selectedPlan.id)
      prevId.current = selectedPlan.id
      Animated.parallel([
        Animated.spring(heroScale,   { toValue: 1, useNativeDriver: true, speed: 28, bounciness: 14 }),
        Animated.timing(heroOpacity, { toValue: 1, duration: 160, useNativeDriver: true }),
      ]).start()
    })
  }, [selectedPlan.id])

  return (
    <View style={styles.featureCard}>
      <Animated.View style={[styles.featureHero, { opacity: heroOpacity, transform: [{ scale: heroScale }] }]}>
        <Text style={styles.featureHeroPeriod}>{shownPlan.period}</Text>
        <Text style={styles.featureHeroLabel}>
          <Text style={styles.featureHeroAnalogy}>{shownPlan.analogy}</Text>
          <Text style={styles.featureHeroSuffix}>{shownPlan.analogySub}</Text>
        </Text>
        <Animated.View style={{ transform: [{ scale: breathe }] }}>
          <Text style={styles.featureHeroEmoji}>{PLAN_EMOJI[shownPlan.id as keyof typeof PLAN_EMOJI]}</Text>
        </Animated.View>
        <Text style={styles.planHint}>{shownPlan.hint}</Text>

        <View style={styles.coachBubble}>
          <Text style={styles.coachBubbleText}>{shownPlan.coachExample}</Text>
        </View>
      </Animated.View>

      <View style={styles.featureDivider} />

      <Animated.View style={[styles.featureRow, { opacity: heroOpacity }]}>
        {shownPlan.features.map((f) => (
          <TouchableOpacity
            key={f.text}
            style={styles.featureCell}
            onPress={() => FEATURE_DETAILS[f.text] && onPressFeature(f.text)}
            activeOpacity={FEATURE_DETAILS[f.text] ? 0.7 : 1}
          >
            <Text style={styles.featureCellIcon}>{f.icon}</Text>
            <Text style={styles.featureCellText}>{f.text}</Text>
            {FEATURE_DETAILS[f.text] && <Text style={styles.featureCellHint}>↑</Text>}
          </TouchableOpacity>
        ))}
      </Animated.View>
    </View>
  )
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

// ─── Promo Code Modal ─────────────────────────────────────────────────────────

function PromoCodeModal({ visible, onClose, onSuccess }: {
  visible: boolean
  onClose: () => void
  onSuccess: () => void
}) {
  const { redeemPromoCode } = useAuthStore()
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const translateY = useRef(new Animated.Value(300)).current
  const opacity    = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (visible) {
      setCode('')
      translateY.setValue(300)
      opacity.setValue(0)
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
        Animated.spring(translateY, { toValue: 0, useNativeDriver: true, damping: 22, stiffness: 200 }),
      ]).start()
    }
  }, [visible])

  const handleClose = () => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 0, duration: 160, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 300, duration: 200, useNativeDriver: true }),
    ]).start(() => onClose())
  }

  const handleRedeem = async () => {
    if (!code.trim()) return
    setLoading(true)
    try {
      const result = await redeemPromoCode(code.trim())
      if (result.ok) {
        handleClose()
        onSuccess()
      } else {
        const msg: Record<string, string> = {
          invalid_code: '유효하지 않은 코드예요.',
          expired:      '만료된 코드예요.',
          exhausted:    '이미 모두 사용된 코드예요.',
          already_used: '이미 사용한 코드예요.',
          server_error: '서버 오류가 발생했어요. 다시 시도해주세요.',
        }
        Alert.alert('코드 오류', msg[result.error ?? ''] ?? '알 수 없는 오류예요.')
      }
    } finally {
      setLoading(false)
    }
  }

  if (!visible) return null

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Animated.View style={[promoStyles.overlay, { opacity }]}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={handleClose} />
          <Animated.View style={[promoStyles.sheet, { transform: [{ translateY }] }]}>
            <View style={promoStyles.handle} />
            <Text style={promoStyles.title}>프로모 코드 입력</Text>
            <Text style={promoStyles.subtitle}>받으신 코드를 입력하면 무료로 시작할 수 있어요</Text>
            <TextInput
              style={promoStyles.input}
              value={code}
              onChangeText={(t) => setCode(t.toUpperCase())}
              placeholder="예: REDAPPLE2026"
              placeholderTextColor={colors.textTertiary}
              autoCapitalize="characters"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={handleRedeem}
            />
            <TouchableOpacity
              style={[promoStyles.redeemBtn, (!code.trim() || loading) && promoStyles.redeemBtnDisabled]}
              onPress={handleRedeem}
              disabled={!code.trim() || loading}
              activeOpacity={0.85}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={promoStyles.redeemBtnText}>코드 적용하기</Text>
              }
            </TouchableOpacity>
            <TouchableOpacity onPress={handleClose} style={promoStyles.cancelBtn} activeOpacity={0.6}>
              <Text style={promoStyles.cancelText}>취소</Text>
            </TouchableOpacity>
          </Animated.View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const promoStyles = StyleSheet.create({
  overlay:        { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet:          {
    backgroundColor: colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: 24, paddingTop: 12, paddingBottom: 40, alignItems: 'center',
  },
  handle:         { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.borderSoft, marginBottom: 20 },
  title:          { fontSize: 20, fontWeight: '700', color: colors.textPrimary, letterSpacing: -0.4, marginBottom: 6 },
  subtitle:       { fontSize: 13, color: colors.textSecondary, textAlign: 'center', marginBottom: 20, lineHeight: 19 },
  input:          {
    width: '100%', height: 52, borderRadius: 14,
    backgroundColor: colors.background,
    borderWidth: 1.5, borderColor: colors.borderSoft,
    paddingHorizontal: 16, fontSize: 17, fontWeight: '700',
    color: colors.textPrimary, letterSpacing: 1.5,
    textAlign: 'center', marginBottom: 14,
  },
  redeemBtn:      {
    width: '100%', height: 52, borderRadius: 14,
    backgroundColor: colors.mint, alignItems: 'center', justifyContent: 'center',
    marginBottom: 10,
  },
  redeemBtnDisabled: { opacity: 0.35 },
  redeemBtnText:  { fontSize: 16, fontWeight: '700', color: '#fff' },
  cancelBtn:      { paddingVertical: 10, paddingHorizontal: 20 },
  cancelText:     { fontSize: 14, color: colors.textTertiary, fontWeight: '500' },
})

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function PaywallScreen() {
  const insets = useSafeAreaInsets()
  const { setPremium } = useAuthStore()


  const [rcPrices, setRcPrices] = useState<Partial<Record<PlanType, string>>>({})

  useEffect(() => {
    getOfferings().then((pkgs) => {
      const prices: Partial<Record<PlanType, string>> = {}
      for (const pkg of pkgs) {
        const plan = PRODUCT_IDS[pkg.product.identifier]
        if (plan) prices[plan] = pkg.product.priceString
      }
      if (Object.keys(prices).length > 0) setRcPrices(prices)
    }).catch(() => {})
  }, [])

  const plansWithPrice = PLANS.map((p) => ({
    ...p,
    price: rcPrices[p.id] ?? p.price,
  }))
  const visiblePlans = plansWithPrice

  const [selected, setSelected] = useState<PlanType>('yearly')
  const [activeFeature, setActiveFeature] = useState<FeatureDetail | null>(null)

  const [loading, setLoading] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [promoVisible, setPromoVisible] = useState(false)
  const ctaOpacity = useRef(new Animated.Value(1)).current
  const mainScrollRef = useRef<ScrollView>(null)

  // 진입 시: 1.2초 후 플랜 섹션까지 스크롤 → 1초 유지 → 상단으로 복귀
  useEffect(() => {
    const t1 = setTimeout(() => {
      mainScrollRef.current?.scrollToEnd({ animated: true })
    }, 1200)
    const t2 = setTimeout(() => {
      mainScrollRef.current?.scrollTo({ y: 0, animated: true })
    }, 3000)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [])

  const handleSelect = (id: PlanType) => {
    if (id === selected) return
    Animated.timing(ctaOpacity, { toValue: 0, duration: 100, useNativeDriver: true }).start(() => {
      setSelected(id)
      Animated.timing(ctaOpacity, { toValue: 1, duration: 160, useNativeDriver: true }).start()
    })
  }

  const handlePressFeature = (key: string) => {
    const detail = FEATURE_DETAILS[key]
    if (detail) setActiveFeature(detail)
  }

  const handleStart = async () => {
    setLoading(true)
    try {
      await purchasePlan(selected)
      await setPremium(selected)

      const targetDays = 84
      const { bodyInfo, session } = useAuthStore.getState()
      if (bodyInfo && session) {
        useAuthStore.setState({ bodyInfo: { ...bodyInfo, target_days: targetDays } })
        await supabase.from('profiles').update({ target_days: targetDays }).eq('id', session.user.id)
      }

      router.replace('/(tabs)')
    } catch (err: any) {
      if (err?.message !== 'CANCELLED') {
        Alert.alert('결제 실패', '결제 중 문제가 발생했어요. 다시 시도해주세요.')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleRestore = async () => {
    setRestoring(true)
    try {
      const plan = await restorePurchases()
      if (plan) {
        await setPremium(plan)
        router.replace('/(tabs)')
      } else {
        Alert.alert('복원 없음', '복원할 구매 내역이 없어요.')
      }
    } catch {
      Alert.alert('복원 실패', '구매 복원 중 문제가 발생했어요.')
    } finally {
      setRestoring(false)
    }
  }

  const selectedPlan = plansWithPrice.find((p) => p.id === selected)!

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <ScrollView
        ref={mainScrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.topBadgeRow}>
            <View style={styles.noBillingBadge}>
              <Text style={styles.noBillingBadgeText}>✨ 14일 무료 체험</Text>
            </View>
          </View>
          <Text style={styles.headline}>단백질 말고,{'\n'}진짜 코치.</Text>
          <Text style={styles.headlineItalic}>분할 설정부터 볼륨·단백질 처방까지 — 혼자가 아니에요.</Text>
        </View>

        {/* Plan-specific feature card */}
        <FeatureCard selectedPlan={selectedPlan} onPressFeature={handlePressFeature} />

        {/* Plan picker */}
        <Text style={styles.planSectionLabel}>플랜 선택</Text>
        <View style={styles.planRow}>
          {visiblePlans.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              isSelected={selected === plan.id}
              onSelect={() => handleSelect(plan.id)}
            />
          ))}
        </View>
      </ScrollView>

      {/* CTA */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom }]}>
        <TouchableOpacity style={styles.ctaBtn} onPress={handleStart} activeOpacity={0.88} disabled={loading}>
          {loading
            ? <ActivityIndicator color="#fff" />
            : (
              <Animated.Text style={[styles.ctaBtnText, { opacity: ctaOpacity }]}>
                14일 무료 체험 시작 — {selected === 'yearly' ? '₩99,000/년' : '₩19,900/월'}
              </Animated.Text>
            )
          }
        </TouchableOpacity>
        <Text style={styles.ctaSub}>14일 무료 · 이후 자동 결제 · 언제든 취소 가능</Text>
        <View style={styles.bottomBtnRow}>
          <TouchableOpacity onPress={() => setPromoVisible(true)} style={styles.restoreBtn}>
            <Text style={styles.restoreBtnText}>코드 입력</Text>
          </TouchableOpacity>
          <View style={styles.bottomBtnDivider} />
          <TouchableOpacity onPress={handleRestore} disabled={restoring} style={styles.restoreBtn}>
            <Text style={styles.restoreBtnText}>{restoring ? '복원 중...' : '구매 복원'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Feature detail modal */}
      <FeatureDetailModal
        feature={activeFeature}
        onClose={() => setActiveFeature(null)}
      />

      {/* Promo code modal */}
      <PromoCodeModal
        visible={promoVisible}
        onClose={() => setPromoVisible(false)}
        onSuccess={() => router.replace('/(tabs)')}
      />
    </View>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 16,
  },

  // Header
  header: { alignItems: 'center', marginBottom: 12, marginTop: 0 },
  topBadgeRow: {
    flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 8,
  },
  premiumBadge: {
    backgroundColor: colors.textPrimary, borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 5,
  },
  premiumBadgeText: { fontSize: 11, fontWeight: '700', color: '#fff', letterSpacing: 0.5 },
  noBillingBadge: {
    backgroundColor: '#E8F5E9', borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 5,
  },
  noBillingBadgeText: { fontSize: 11, fontWeight: '700', color: '#2E7D32', letterSpacing: 0.3 },
  headline: {
    fontSize: 38, fontWeight: '700', color: colors.textPrimary,
    letterSpacing: -1.5, textAlign: 'center', lineHeight: 44,
  },
  headlineItalic: {
    marginTop: 6, marginBottom: 6,
    fontSize: 14, fontWeight: '400',
    color: colors.textSecondary, letterSpacing: -0.2, textAlign: 'center', lineHeight: 20,
  },


  // Feature card
  featureCard: {
    backgroundColor: colors.surface, borderRadius: 20,
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 14,
    marginBottom: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  featureHero: { alignItems: 'center', gap: 2, marginBottom: 12 },
  featureHeroPeriod: { fontSize: 48, fontWeight: '800', color: colors.textPrimary, letterSpacing: -2 },
  featureHeroEmoji: { fontSize: 80, marginTop: 4, textAlign: 'center' },
  featureHeroLabel: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
  featureHeroAnalogy: { fontSize: 18, fontWeight: '800', color: colors.textPrimary },
  featureHeroSuffix: { fontSize: 18, fontWeight: '400', color: colors.textSecondary },
  featureDivider: { height: 1, backgroundColor: colors.borderSoft, marginBottom: 14 },
  featureRow: { flexDirection: 'row', gap: 8 },
  featureCell: {
    flex: 1, alignItems: 'center', gap: 4,
    backgroundColor: colors.background, borderRadius: 12,
    paddingVertical: 10,
  },
  featureCellIcon: { fontSize: 20 },
  featureCellText: { fontSize: 11, fontWeight: '500', color: colors.textPrimary, textAlign: 'center' },
  featureCellHint: { fontSize: 9, color: colors.textTertiary },
  planHint: {
    fontSize: 13, color: colors.textSecondary, textAlign: 'center',
    lineHeight: 19, paddingHorizontal: 4, marginTop: 2,
  },
  coachBubble: {
    marginTop: 10,
    backgroundColor: colors.background,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderLeftWidth: 3,
    borderLeftColor: colors.textPrimary,
    alignSelf: 'stretch',
  },
  coachBubbleText: {
    fontSize: 12, fontWeight: '500', color: colors.textSecondary,
    lineHeight: 18, fontStyle: 'italic',
  },

  // Plans
  planSectionLabel: {
    fontSize: 11, fontWeight: '600', color: colors.textTertiary,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10,
  },
  planRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  planCardWrap: { flex: 1 },
  planCard: {
    backgroundColor: colors.surface, borderRadius: 20,
    paddingVertical: 16, paddingHorizontal: 10,
    alignItems: 'center', gap: 3,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
    overflow: 'visible',
  },
  popularBadge: {
    position: 'absolute', top: -10,
    backgroundColor: colors.textPrimary,
    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3,
  },
  popularBadgeText: { fontSize: 10, fontWeight: '700', color: '#fff' },
  planPeriod: {
    fontSize: 17, fontWeight: '700', color: colors.textSecondary, letterSpacing: -0.3,
  },
  planPeriodSelected: { color: colors.textPrimary },
  planEmoji: { fontSize: 40, marginVertical: 4, textAlign: 'center' },
  planPeriodSub: { fontSize: 10, color: colors.textTertiary, fontWeight: '400' },
  planOriginalPrice: {
    fontSize: 11, color: colors.textTertiary, textDecorationLine: 'line-through', marginTop: 2,
  },
  planPrice: {
    fontSize: 15, fontWeight: '700', color: colors.textSecondary, letterSpacing: -0.3, marginTop: 1,
  },
  planPriceSelected: { color: colors.textPrimary },

  // CTA
  bottomBar: {
    paddingHorizontal: 24, paddingTop: 16,
    backgroundColor: colors.background, gap: 8, alignItems: 'center',
  },
  ctaBtn: {
    backgroundColor: colors.mint, borderRadius: 16,
    height: 56, width: '100%', alignItems: 'center', justifyContent: 'center',
  },
  ctaBtnText: { fontSize: 17, fontWeight: '700', color: '#fff', letterSpacing: -0.3 },
  ctaSub: { fontSize: 12, color: colors.textTertiary },
  bottomBtnRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  bottomBtnDivider: { width: 1, height: 12, backgroundColor: colors.borderSoft, marginHorizontal: 4 },
  restoreBtn: { paddingVertical: 6, paddingHorizontal: 12 },
  restoreBtnText: { fontSize: 12, color: colors.textTertiary, textDecorationLine: 'underline' },
})

import { useState, useRef, useEffect, useCallback } from 'react'
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
  Image,
} from 'react-native'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors } from '@repo/theme'
import { useAuthStore, type PlanType } from '../../store/auth'
import { supabase } from '../../lib/supabase'
import Purchases from 'react-native-purchases'
import { purchasePlan, restorePurchases, getOfferings, PRODUCT_IDS } from '../../lib/iap'
import { getPlanLocale } from '../../lib/paywallLocale'
import { t } from '../../lib/i18n'

const { width: SCREEN_WIDTH } = Dimensions.get('window')

type Feature = { icon: string; text: string }

type FeatureKey = 'ai' | 'diet' | 'exercise' | 'tracking' | 'notif' | '3pack'

const PLANS: {
  id: PlanType
  period: () => string
  periodSub: () => string
  price: string
  originalPrice?: string
  badge?: () => string
  hint: () => string
  coachExample: () => string
  features: { icon: string; key: FeatureKey }[]
}[] = [
  {
    id: '1week',
    period: () => t('paywall_plan_1w_period'),
    periodSub: () => t('paywall_plan_1w_sub'),
    price: '$3.99',
    hint: () => t('paywall_plan_hint_1week'),
    coachExample: () => t('paywall_coach_1week'),
    features: [
      { icon: '🤖', key: 'ai' },
      { icon: '📸', key: 'diet' },
      { icon: '🏃', key: 'exercise' },
      { icon: '📊', key: 'tracking' },
    ],
  },
  {
    id: '2week',
    period: () => t('paywall_plan_2w_period'),
    periodSub: () => t('paywall_plan_2w_sub'),
    price: '$6.99',
    badge: () => t('paywall_badge_recommended'),
    hint: () => t('paywall_plan_hint_2week'),
    coachExample: () => t('paywall_coach_2week'),
    features: [
      { icon: '📸', key: 'diet' },
      { icon: '🏃', key: 'exercise' },
      { icon: '🤖', key: 'ai' },
      { icon: '🔔', key: 'notif' },
    ],
  },
  {
    id: '2week_x3',
    period: () => t('paywall_plan_x3_period'),
    periodSub: () => t('paywall_plan_x3_sub'),
    price: '$13.99',
    originalPrice: '$20.97',
    badge: () => t('paywall_badge_value'),
    hint: () => t('paywall_plan_hint_x3'),
    coachExample: () => t('paywall_coach_x3'),
    features: [
      { icon: '🔥', key: '3pack' },
      { icon: '📸', key: 'diet' },
      { icon: '🏃', key: 'exercise' },
      { icon: '🤖', key: 'ai' },
    ],
  },
]

// ─── Feature Detail Data ──────────────────────────────────────────────────────

type FeatureDetail = {
  icon: string
  title: () => string
  subtitle: () => string
  bullets: { emoji: string; text: () => string }[]
}

const FEATURE_DETAILS: Record<FeatureKey, FeatureDetail> = {
  ai: {
    icon: '🤖',
    title: () => t('fd_ai_title'),
    subtitle: () => t('fd_ai_subtitle'),
    bullets: [
      { emoji: '📊', text: () => t('fd_ai_b1') },
      { emoji: '🔄', text: () => t('fd_ai_b2') },
      { emoji: '💬', text: () => t('fd_ai_b3') },
      { emoji: '🎯', text: () => t('fd_ai_b4') },
    ],
  },
  diet: {
    icon: '📸',
    title: () => t('fd_diet_title'),
    subtitle: () => t('fd_diet_subtitle'),
    bullets: [
      { emoji: '📷', text: () => t('fd_diet_b1') },
      { emoji: '✏️', text: () => t('fd_diet_b2') },
      { emoji: '🍽️', text: () => t('fd_diet_b3') },
      { emoji: '⚠️', text: () => t('fd_diet_b4') },
    ],
  },
  exercise: {
    icon: '🏃',
    title: () => t('fd_ex_title'),
    subtitle: () => t('fd_ex_subtitle'),
    bullets: [
      { emoji: '🔥', text: () => t('fd_ex_b1') },
      { emoji: '🚴', text: () => t('fd_ex_b2') },
      { emoji: '⏱️', text: () => t('fd_ex_b3') },
      { emoji: '✅', text: () => t('fd_ex_b4') },
    ],
  },
  tracking: {
    icon: '📊',
    title: () => t('fd_weight_title'),
    subtitle: () => t('fd_weight_subtitle'),
    bullets: [
      { emoji: '📅', text: () => t('fd_weight_b1') },
      { emoji: '📈', text: () => t('fd_weight_b2') },
      { emoji: '🏁', text: () => t('fd_weight_b3') },
      { emoji: '💧', text: () => t('fd_weight_b4') },
    ],
  },
  notif: {
    icon: '🔔',
    title: () => t('fd_notif_title'),
    subtitle: () => t('fd_notif_subtitle'),
    bullets: [
      { emoji: '🌅', text: () => t('fd_notif_b1') },
      { emoji: '🍽️', text: () => t('fd_notif_b2') },
      { emoji: '💪', text: () => t('fd_notif_b3') },
      { emoji: '🔁', text: () => t('fd_notif_b4') },
    ],
  },
  '3pack': {
    icon: '🔥',
    title: () => t('fd_3pack_title'),
    subtitle: () => t('fd_3pack_subtitle'),
    bullets: [
      { emoji: '🎟️', text: () => t('fd_3pack_b1') },
      { emoji: '💰', text: () => t('fd_3pack_b2') },
      { emoji: '🔄', text: () => t('fd_3pack_b3') },
      { emoji: '📦', text: () => t('fd_3pack_b4') },
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
          <Text style={modalStyles.title}>{feature.title()}</Text>
          <Text style={modalStyles.subtitle}>{feature.subtitle()}</Text>
          <View style={modalStyles.bullets}>
            {feature.bullets.map((b, i) => (
              <View key={i} style={modalStyles.bulletRow}>
                <Text style={modalStyles.bulletEmoji}>{b.emoji}</Text>
                <Text style={modalStyles.bulletText}>{b.text()}</Text>
              </View>
            ))}
          </View>
          <TouchableOpacity style={modalStyles.closeBtn} onPress={handleClose} activeOpacity={0.8}>
            <Text style={modalStyles.closeBtnText}>{t('paywall_feature_detail_close')}</Text>
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
    backgroundColor: colors.textPrimary, borderRadius: 14,
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
  plan: (typeof PLANS)[0] & { rcPrice: string | null }
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
              <Text style={styles.popularBadgeText}>{plan.badge()}</Text>
            </View>
          )}

          <Text style={[styles.planPeriod, isSelected && styles.planPeriodSelected]}>
            {plan.period()}
          </Text>
          <Text style={styles.planPeriodSub}>{plan.periodSub()}</Text>

          <Animated.View style={{ transform: [{ scale: emojiScale }] }}>
            <Image source={getPlanLocale(plan.id).image} style={styles.planEmoji} resizeMode="contain" />
          </Animated.View>

          {plan.rcPrice && plan.originalPrice && (
            <Text style={styles.planOriginalPrice}>{plan.originalPrice}</Text>
          )}
          {plan.rcPrice && (
            <Text style={[styles.planPrice, isSelected && styles.planPriceSelected]}>
              {plan.rcPrice}
            </Text>
          )}
        </Animated.View>
      </Animated.View>
    </TouchableOpacity>
  )
}

// ─── Feature Card (plan-specific) ────────────────────────────────────────────

function FeatureCard({ selectedPlan, onPressFeature }: {
  selectedPlan: (typeof PLANS)[0]
  onPressFeature: (key: FeatureKey) => void
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
        <Text style={styles.featureHeroPeriod}>{shownPlan.period()}</Text>
        <Text style={styles.featureHeroLabel}>
          <Text style={styles.featureHeroAnalogy}>{getPlanLocale(shownPlan.id).analogy}</Text>
          <Text style={styles.featureHeroSuffix}>{getPlanLocale(shownPlan.id).analogySub}</Text>
        </Text>
        <Animated.View style={{ transform: [{ scale: breathe }] }}>
          <Image source={getPlanLocale(shownPlan.id).image} style={styles.featureHeroEmoji} resizeMode="contain" />
        </Animated.View>
        <Text style={styles.planHint}>{shownPlan.hint()}</Text>

        <View style={styles.coachBubble}>
          <Text style={styles.coachBubbleText}>{shownPlan.coachExample()}</Text>
        </View>
      </Animated.View>

      <View style={styles.featureDivider} />

      <Animated.View style={[styles.featureRow, { opacity: heroOpacity }]}>
        {shownPlan.features.map((f) => (
          <TouchableOpacity
            key={f.key}
            style={styles.featureCell}
            onPress={() => onPressFeature(f.key)}
            activeOpacity={0.7}
          >
            <Text style={styles.featureCellIcon}>{f.icon}</Text>
            <Text style={styles.featureCellText}>{FEATURE_DETAILS[f.key].title()}</Text>
            <Text style={styles.featureCellHint}>↑</Text>
          </TouchableOpacity>
        ))}
      </Animated.View>
    </View>
  )
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

// ─── Promo Code Modal ─────────────────────────────────────────────────────────

function PromoCodeModal({ visible, onClose }: {
  visible: boolean
  onClose: () => void
  onSuccess: () => void
}) {
  const { redeemPromoCode } = useAuthStore()
  const translateY = useRef(new Animated.Value(300)).current
  const opacity    = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (visible) {
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
    handleClose()
    await redeemPromoCode()
  }

  if (!visible) return null

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={handleClose}>
      <Animated.View style={[promoStyles.overlay, { opacity }]}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={handleClose} />
        <Animated.View style={[promoStyles.sheet, { transform: [{ translateY }] }]}>
          <View style={promoStyles.handle} />
          <Text style={promoStyles.title}>{t('paywall_promo_title')}</Text>
          <Text style={promoStyles.subtitle}>{t('paywall_promo_subtitle')}</Text>
          <TouchableOpacity
            style={promoStyles.redeemBtn}
            onPress={handleRedeem}
            activeOpacity={0.85}
          >
            <Text style={promoStyles.redeemBtnText}>{t('paywall_promo_apply')}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleClose} style={promoStyles.cancelBtn} activeOpacity={0.6}>
            <Text style={promoStyles.cancelText}>{t('paywall_promo_cancel')}</Text>
          </TouchableOpacity>
        </Animated.View>
      </Animated.View>
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
  redeemBtn:      {
    width: '100%', height: 52, borderRadius: 14,
    backgroundColor: colors.textPrimary, alignItems: 'center', justifyContent: 'center',
    marginBottom: 10,
  },
  redeemBtnDisabled: { opacity: 0.4 },
  redeemBtnText:  { fontSize: 16, fontWeight: '700', color: '#fff' },
  cancelBtn:      { paddingVertical: 10, paddingHorizontal: 20 },
  cancelText:     { fontSize: 14, color: colors.textTertiary, fontWeight: '500' },
})

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function PaywallScreen() {
  const insets = useSafeAreaInsets()
  const { setPremium } = useAuthStore()

  const bodyInfo = useAuthStore((s) => s.bodyInfo)
  const weightDiff = bodyInfo ? bodyInfo.weight - (bodyInfo.target_weight ?? bodyInfo.weight) : 0

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
    rcPrice: rcPrices[p.id] ?? null,
  }))
  const visiblePlans = plansWithPrice.filter((p) => !(p.id === '1week' && weightDiff > 2))

  const [selected, setSelected] = useState<PlanType>('2week')
  const [activeFeature, setActiveFeature] = useState<FeatureDetail | null>(null)

  const [loading, setLoading] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [promoVisible, setPromoVisible] = useState(false)
  const ctaOpacity = useRef(new Animated.Value(1)).current
  const mainScrollRef = useRef<ScrollView>(null)

  // offer code redeem 완료 감지
  useEffect(() => {
    const handler = async (info: any) => {
      if (useAuthStore.getState().isPremium) return
      const hasPremium = !!info.entitlements.active['Premium']
      if (!hasPremium) return
      const tx = (info.nonSubscriptionTransactions ?? [])[0]
      const plan = tx ? (PRODUCT_IDS[tx.productIdentifier] ?? '1week') : '1week'
      await setPremium(plan)
      router.replace('/(tabs)')
    }
    Purchases.addCustomerInfoUpdateListener(handler)
    return () => { Purchases.removeCustomerInfoUpdateListener(handler) }
  }, [])

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

  const handlePressFeature = (key: FeatureKey) => {
    setActiveFeature(FEATURE_DETAILS[key])
  }

  const handleStart = async () => {
    setLoading(true)
    try {
      await purchasePlan(selected)
      await setPremium(selected)

      const targetDays = selected === '1week' ? 7 : 14
      const { bodyInfo, session } = useAuthStore.getState()
      if (bodyInfo && session) {
        useAuthStore.setState({ bodyInfo: { ...bodyInfo, target_days: targetDays } })
        await supabase.from('profiles').update({ target_days: targetDays }).eq('id', session.user.id)
      }

      router.replace('/(tabs)')
    } catch (err: any) {
      console.error('[purchasePlan] error:', JSON.stringify(err))
      if (err?.message !== 'CANCELLED') {
        Alert.alert(t('paywall_purchase_fail_title'), t('paywall_purchase_fail_msg'))
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
        Alert.alert(t('paywall_restore_none_title'), t('paywall_restore_none_msg'))
      }
    } catch {
      Alert.alert(t('paywall_restore_fail_title'), t('paywall_restore_fail_msg'))
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
            <View style={styles.premiumBadge}>
              <Text style={styles.premiumBadgeText}>{t('paywall_badge')}</Text>
            </View>
          </View>
          <Text style={styles.headline}>{t('paywall_headline')}</Text>
          <Text style={styles.headlineItalic}>{t('paywall_subheadline')}</Text>
        </View>

        {/* Plan-specific feature card */}
        <FeatureCard selectedPlan={selectedPlan} onPressFeature={handlePressFeature} />

        {/* Plan picker */}
        <Text style={styles.planSectionLabel}>{t('paywall_plan_section')}</Text>
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
                {selected === '1week' ? t('paywall_cta_1week') : selected === '2week' ? t('paywall_cta_2week') : t('paywall_cta_x3')}
              </Animated.Text>
            )
          }
        </TouchableOpacity>
        <Text style={styles.ctaSub}>{t('paywall_no_subscription')}</Text>
        <View style={styles.bottomBtnRow}>
          <TouchableOpacity onPress={() => setPromoVisible(true)} style={styles.restoreBtn}>
            <Text style={styles.restoreBtnText}>{t('paywall_promo_code')}</Text>
          </TouchableOpacity>
          <View style={styles.bottomBtnDivider} />
          <TouchableOpacity onPress={handleRestore} disabled={restoring} style={styles.restoreBtn}>
            <Text style={styles.restoreBtnText}>{restoring ? t('paywall_restoring') : t('paywall_restore')}</Text>
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
  _devPremiumBtn: {
    position: 'absolute', top: 56, right: 16, zIndex: 99,
    backgroundColor: '#FF3B30', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 6,
  },
  _devPremiumText: { fontSize: 11, fontWeight: '700', color: '#fff' },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 16,
  },

  // Header
  header: { alignItems: 'center', marginBottom: 20, marginTop: 8 },
  topBadgeRow: {
    flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 12,
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
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 18,
    marginBottom: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  featureHero: { alignItems: 'center', gap: 2, marginBottom: 12 },
  featureHeroPeriod: { fontSize: 48, fontWeight: '800', color: colors.textPrimary, letterSpacing: -2 },
  featureHeroEmoji: { width: 96, height: 96, marginTop: 4 },
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
    alignItems: 'center', gap: 3, minHeight: 200,
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
  planEmoji: { width: 48, height: 48, marginVertical: 4 },
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
    backgroundColor: colors.textPrimary, borderRadius: 16,
    height: 56, width: '100%', alignItems: 'center', justifyContent: 'center',
  },
  ctaBtnText: { fontSize: 17, fontWeight: '700', color: '#fff', letterSpacing: -0.3 },
  ctaSub: { fontSize: 12, color: colors.textTertiary },
  bottomBtnRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  bottomBtnDivider: { width: 1, height: 12, backgroundColor: colors.borderSoft, marginHorizontal: 4 },
  restoreBtn: { paddingVertical: 6, paddingHorizontal: 12 },
  restoreBtnText: { fontSize: 12, color: colors.textTertiary, textDecorationLine: 'underline' },
})

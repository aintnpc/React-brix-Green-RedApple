import { useEffect, useRef, useState } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Animated, Easing, Alert,
} from 'react-native'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors } from '@repo/theme'
import { useAuthStore } from '../../store/auth'
import { useWeightLogStore } from '../../store/weightLog'
import { kgToDisplay, weightUnit } from '../../lib/locale'
import { t } from '../../lib/i18n'

export default function CompletionScreen() {
  const insets = useSafeAreaInsets()
  const { bodyInfo, programStartedAt, selectedPlan, remainingSessions, consumeSession, unitSystem } = useAuthStore()
  const { entries } = useWeightLogStore()
  const wUnit = weightUnit(unitSystem)

  // 시작 체중 / 최근 체중 (내부 kg)
  const startWeight = bodyInfo?.weight ?? null
  const latestEntry = entries.length > 0 ? entries[entries.length - 1] : null
  const latestWeight = latestEntry?.weight ?? startWeight
  const lost = startWeight && latestWeight ? Math.max(0, startWeight - latestWeight) : 0

  // 표시용 변환
  const dispStart  = startWeight  ? kgToDisplay(startWeight, unitSystem)  : null
  const dispLatest = latestWeight ? kgToDisplay(latestWeight, unitSystem) : null
  const dispLost   = kgToDisplay(lost, unitSystem).toFixed(1)

  const targetWeight = bodyInfo?.target_weight ?? null
  const achieved = targetWeight !== null && latestWeight !== null && latestWeight <= targetWeight

  const targetDays = bodyInfo?.target_days ?? 14

  // 날짜 범위 텍스트
  const dateRange = (() => {
    if (!programStartedAt) return ''
    const start = new Date(programStartedAt)
    const end = new Date(start)
    end.setDate(start.getDate() + targetDays - 1)
    const fmt = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`
    return `${fmt(start)} – ${fmt(end)}`
  })()

  // 애니메이션
  const fadeAnim  = useRef(new Animated.Value(0)).current
  const scaleAnim = useRef(new Animated.Value(0.85)).current

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, damping: 18, stiffness: 180 }),
    ]).start()
  }, [])

  // 선택지
  const [choice, setChoice] = useState<'new' | 'stop' | null>(null)

  const handleNewGoal = async () => {
    if (selectedPlan === '2week_x3') {
      const left = (remainingSessions ?? 1) - 1
      const msg = left > 0
        ? t('completion_pass_remaining', left)
        : t('completion_pass_last')
      await new Promise<void>((resolve) =>
        Alert.alert(t('completion_pass_confirm_title'), msg, [
          { text: t('profile_cancel'), style: 'cancel' },
          { text: t('confirm'), onPress: () => resolve() },
        ])
      )
      await consumeSession()
    }
    router.replace({ pathname: '/onboarding', params: { mode: 'regoal' } })
  }

  const handleStop = async () => {
    await useAuthStore.getState().setProgramEnded()
    router.replace('/(tabs)/')
  }

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={[s.heroWrap, { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}>
          <Text style={s.trophy}>🏆</Text>
          <Text style={s.heroTitle}>
            {t('completion_title', targetDays)}
          </Text>
          {dateRange ? <Text style={s.heroDate}>{dateRange}</Text> : null}
        </Animated.View>

        {/* 결과 카드 */}
        <Animated.View style={[s.resultCard, { opacity: fadeAnim }]}>
          <View style={s.resultRow}>
            <View style={s.resultItem}>
              <Text style={s.resultLabel}>{t('completion_start_weight')}</Text>
              <Text style={s.resultNum}>
                {dispStart ?? '–'}
                <Text style={s.resultUnit}>{wUnit}</Text>
              </Text>
            </View>
            <Text style={s.resultArrow}>→</Text>
            <View style={s.resultItem}>
              <Text style={s.resultLabel}>{t('completion_current_weight')}</Text>
              <Text style={[s.resultNum, { color: colors.mint }]}>
                {dispLatest ?? '–'}
                <Text style={[s.resultUnit, { color: colors.mint }]}>{wUnit}</Text>
              </Text>
            </View>
          </View>

          <View style={s.lostRow}>
            <Text style={s.lostText}>
              {t('completion_lost', dispLost, wUnit)}
            </Text>
            {achieved && (
              <View style={s.goalBadge}>
                <Text style={s.goalBadgeText}>{t('completion_goal_badge')}</Text>
              </View>
            )}
          </View>
        </Animated.View>

        {/* 질문 */}
        <Animated.View style={{ opacity: fadeAnim }}>
          <Text style={s.questionTitle}>{t('completion_question_title')}</Text>
          <Text style={s.questionDesc}>
            {t('completion_question_desc')}
          </Text>

          <TouchableOpacity
            style={[s.choiceCard, choice === 'new' && s.choiceCardSelected]}
            onPress={() => setChoice('new')}
            activeOpacity={0.8}
          >
            <Text style={s.choiceEmoji}>🎯</Text>
            <View style={s.choiceBody}>
              <Text style={s.choiceTitle}>{t('completion_new_goal_title')}</Text>
              <Text style={s.choiceDesc}>{t('completion_new_goal_desc')}</Text>
            </View>
            <View style={[s.choiceCheck, choice === 'new' && s.choiceCheckSelected]}>
              {choice === 'new' && <Text style={s.choiceCheckMark}>✓</Text>}
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.choiceCard, choice === 'stop' && s.choiceCardSelected]}
            onPress={() => setChoice('stop')}
            activeOpacity={0.8}
          >
            <Text style={s.choiceEmoji}>✋</Text>
            <View style={s.choiceBody}>
              <Text style={s.choiceTitle}>{t('completion_stop_title')}</Text>
              <Text style={s.choiceDesc}>{t('completion_stop_desc')}</Text>
            </View>
            <View style={[s.choiceCheck, choice === 'stop' && s.choiceCheckSelected]}>
              {choice === 'stop' && <Text style={s.choiceCheckMark}>✓</Text>}
            </View>
          </TouchableOpacity>
        </Animated.View>
      </ScrollView>

      {/* 하단 CTA */}
      <View style={[s.bottomBar, { paddingBottom: insets.bottom + 16 }]}>
        {choice === 'new' && (
          <TouchableOpacity style={s.ctaBtn} onPress={handleNewGoal} activeOpacity={0.85}>
            <Text style={s.ctaBtnText}>{t('completion_cta_new')}</Text>
          </TouchableOpacity>
        )}
        {choice === 'stop' && (
          <TouchableOpacity style={[s.ctaBtn, s.ctaBtnSoft]} onPress={handleStop} activeOpacity={0.85}>
            <Text style={[s.ctaBtnText, { color: colors.textPrimary }]}>{t('completion_cta_home')}</Text>
          </TouchableOpacity>
        )}
        {!choice && (
          <View style={[s.ctaBtn, s.ctaBtnDisabled]}>
            <Text style={[s.ctaBtnText, { color: colors.textTertiary }]}>{t('completion_cta_placeholder')}</Text>
          </View>
        )}
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  root:    { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: 20, paddingTop: 40, paddingBottom: 40 },

  heroWrap: { alignItems: 'center', marginBottom: 28 },
  trophy:   { fontSize: 72, marginBottom: 16 },
  heroTitle:{ fontSize: 30, fontWeight: '800', color: colors.textPrimary, letterSpacing: -0.8, textAlign: 'center', lineHeight: 38 },
  heroDate: { fontSize: 14, color: colors.textTertiary, marginTop: 8, fontWeight: '500' },

  resultCard: {
    backgroundColor: colors.surface, borderRadius: 24, padding: 24,
    marginBottom: 32,
    shadowColor: '#101828', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07, shadowRadius: 8, elevation: 4,
  },
  resultRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', marginBottom: 20 },
  resultItem: { alignItems: 'center', gap: 4 },
  resultLabel:{ fontSize: 12, color: colors.textTertiary, fontWeight: '500' },
  resultNum:  { fontSize: 36, fontWeight: '800', color: colors.textPrimary, letterSpacing: -0.5 },
  resultUnit: { fontSize: 16, fontWeight: '500', color: colors.textSecondary },
  resultArrow:{ fontSize: 22, color: colors.textTertiary },
  lostRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderTopWidth: 1, borderTopColor: colors.borderSoft, paddingTop: 16 },
  lostText:   { fontSize: 18, fontWeight: '700', color: colors.textPrimary, letterSpacing: -0.3 },
  goalBadge:  { backgroundColor: colors.mintLight, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  goalBadgeText: { fontSize: 12, fontWeight: '700', color: colors.mint },

  questionTitle: { fontSize: 22, fontWeight: '800', color: colors.textPrimary, letterSpacing: -0.4, marginBottom: 6 },
  questionDesc:  { fontSize: 14, color: colors.textSecondary, lineHeight: 20, marginBottom: 16 },

  choiceCard: {
    backgroundColor: colors.surface, borderRadius: 20, padding: 18,
    flexDirection: 'row', alignItems: 'center', gap: 14,
    borderWidth: 1.5, borderColor: colors.borderSoft,
    marginBottom: 10,
    shadowColor: '#101828', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
  },
  choiceCardSelected: { borderColor: colors.textPrimary, borderWidth: 2 },
  choiceEmoji: { fontSize: 28 },
  choiceBody:  { flex: 1, gap: 2 },
  choiceTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  choiceDesc:  { fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
  choiceCheck: {
    width: 24, height: 24, borderRadius: 12,
    borderWidth: 1.5, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  choiceCheckSelected: { backgroundColor: colors.textPrimary, borderColor: colors.textPrimary },
  choiceCheckMark: { fontSize: 12, fontWeight: '700', color: '#fff', lineHeight: 14 },

  bottomBar: { paddingHorizontal: 20, paddingTop: 12, backgroundColor: colors.background },
  ctaBtn: {
    backgroundColor: colors.textPrimary, borderRadius: 16, height: 56,
    alignItems: 'center', justifyContent: 'center',
  },
  ctaBtnSoft: { backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.borderSoft },
  ctaBtnDisabled: { backgroundColor: colors.borderSoft },
  ctaBtnText: { fontSize: 17, fontWeight: '700', color: '#fff', letterSpacing: -0.3 },
})

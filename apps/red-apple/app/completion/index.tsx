import { useEffect, useRef, useState } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Animated,
} from 'react-native'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colorsDark as colors } from '@repo/theme'
import { useAuthStore } from '../../store/auth'
import { useWeightLogStore } from '../../store/weightLog'
import type { BuildBodyInfo } from '@repo/shared'

export default function CompletionScreen() {
  const insets = useSafeAreaInsets()
  const { bodyInfo, programStartedAt, consumeSession } = useAuthStore()
  const { entries } = useWeightLogStore()

  const buildInfo = bodyInfo as BuildBodyInfo | null
  const buildGoal = buildInfo?.build_goal ?? 'bulk'

  const startWeight  = bodyInfo?.weight ?? null
  const latestEntry  = entries.length > 0 ? entries[entries.length - 1] : null
  const latestWeight = latestEntry?.weight ?? startWeight

  // 목표에 따라 변화 방향이 다름
  const weightDiff = startWeight && latestWeight ? latestWeight - startWeight : 0
  const weightDiffAbs = Math.abs(weightDiff).toFixed(1)

  const resultText = (() => {
    if (buildGoal === 'bulk')     return weightDiff >= 0 ? `${weightDiffAbs}kg 증량했어요 💪` : `체중 변화 ${weightDiff.toFixed(1)}kg`
    if (buildGoal === 'cut')      return weightDiff <= 0 ? `${weightDiffAbs}kg 감량했어요 🔥` : `체중 변화 +${weightDiffAbs}kg`
    return `체중 ${weightDiff >= 0 ? '+' : ''}${weightDiff.toFixed(1)}kg`
  })()

  const targetWeight = bodyInfo?.target_weight ?? null
  const achieved = (() => {
    if (!targetWeight || !latestWeight) return false
    if (buildGoal === 'cut')  return latestWeight <= targetWeight
    if (buildGoal === 'bulk') return latestWeight >= targetWeight
    return false
  })()

  const targetDays = bodyInfo?.target_days ?? 84

  const dateRange = (() => {
    if (!programStartedAt) return ''
    const start = new Date(programStartedAt)
    const end   = new Date(start)
    end.setDate(start.getDate() + targetDays - 1)
    const fmt = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`
    return `${fmt(start)} – ${fmt(end)}`
  })()

  const fadeAnim  = useRef(new Animated.Value(0)).current
  const scaleAnim = useRef(new Animated.Value(0.85)).current

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, damping: 18, stiffness: 180 }),
    ]).start()
  }, [])

  const [choice, setChoice] = useState<'new' | 'stop' | null>(null)

  const handleNewGoal = () => {
    router.replace({ pathname: '/onboarding', params: { mode: 'regoal' } })
  }

  const handleStop = () => {
    router.replace('/(tabs)/')
  }

  // 목표별 트레이너 메시지
  const coachMessage = (() => {
    if (buildGoal === 'bulk') return '12주 동안 정말 잘 해냈어요. 지금 몸이 3개월 전이랑 달라진 게 느껴지죠? 다음 목표 설정하고 계속 가봐요.'
    if (buildGoal === 'cut')  return '12주 동안 잘 버텼어요. 체지방 줄이면서 근육 지킨 거, 쉬운 일 아니에요. 다음 단계 도전해봐요.'
    return '12주 꾸준히 해낸 거 자체가 대단한 거예요. 습관이 만들어졌으니 다음 목표로 넘어갈 준비 됐어요.'
  })()

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={[s.heroWrap, { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}>
          <Text style={s.trophy}>🏆</Text>
          <Text style={s.heroTitle}>
            {targetDays}일 프로그램{'\n'}완료했어요!
          </Text>
          {dateRange ? <Text style={s.heroDate}>{dateRange}</Text> : null}
        </Animated.View>

        {/* 결과 카드 */}
        <Animated.View style={[s.resultCard, { opacity: fadeAnim }]}>
          <View style={s.resultRow}>
            <View style={s.resultItem}>
              <Text style={s.resultLabel}>시작 체중</Text>
              <Text style={s.resultNum}>
                {startWeight ?? '–'}
                <Text style={s.resultUnit}>kg</Text>
              </Text>
            </View>
            <Text style={s.resultArrow}>→</Text>
            <View style={s.resultItem}>
              <Text style={s.resultLabel}>현재 체중</Text>
              <Text style={[s.resultNum, { color: colors.mint }]}>
                {latestWeight ?? '–'}
                <Text style={[s.resultUnit, { color: colors.mint }]}>kg</Text>
              </Text>
            </View>
          </View>

          <View style={s.lostRow}>
            <Text style={s.lostText}>{resultText}</Text>
            {achieved && (
              <View style={s.goalBadge}>
                <Text style={s.goalBadgeText}>목표 달성 ✓</Text>
              </View>
            )}
          </View>
        </Animated.View>

        {/* 트레이너 코치 메시지 */}
        <Animated.View style={[s.coachCard, { opacity: fadeAnim }]}>
          <Text style={s.coachIcon}>🧑‍💼</Text>
          <View style={{ flex: 1 }}>
            <Text style={s.coachLabel}>트레이너 한마디</Text>
            <Text style={s.coachText}>{coachMessage}</Text>
          </View>
        </Animated.View>

        {/* 다음 행동 선택 */}
        <Animated.View style={{ opacity: fadeAnim }}>
          <Text style={s.questionTitle}>다음은 어떻게 할까요?</Text>

          <TouchableOpacity
            style={[s.choiceCard, choice === 'new' && s.choiceCardSelected]}
            onPress={() => setChoice('new')}
            activeOpacity={0.8}
          >
            <Text style={s.choiceEmoji}>🎯</Text>
            <View style={s.choiceBody}>
              <Text style={s.choiceTitle}>새로운 목표 설정하기</Text>
              <Text style={s.choiceDesc}>목표·체중만 다시 설정하고 바로 시작해요</Text>
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
              <Text style={s.choiceTitle}>여기서 마무리할게요</Text>
              <Text style={s.choiceDesc}>언제든 돌아오면 다시 도와드릴게요!</Text>
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
            <Text style={s.ctaBtnText}>새 목표 설정하기</Text>
          </TouchableOpacity>
        )}
        {choice === 'stop' && (
          <TouchableOpacity style={[s.ctaBtn, s.ctaBtnSoft]} onPress={handleStop} activeOpacity={0.85}>
            <Text style={[s.ctaBtnText, { color: colors.textPrimary }]}>홈으로 돌아가기</Text>
          </TouchableOpacity>
        )}
        {!choice && (
          <View style={[s.ctaBtn, s.ctaBtnDisabled]}>
            <Text style={[s.ctaBtnText, { color: colors.textTertiary }]}>위에서 선택해주세요</Text>
          </View>
        )}
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  root:    { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: 20, paddingTop: 40, paddingBottom: 40 },

  heroWrap:  { alignItems: 'center', marginBottom: 28 },
  trophy:    { fontSize: 72, marginBottom: 16 },
  heroTitle: { fontSize: 30, fontWeight: '800', color: colors.textPrimary, letterSpacing: -0.8, textAlign: 'center', lineHeight: 38 },
  heroDate:  { fontSize: 14, color: colors.textTertiary, marginTop: 8, fontWeight: '500' },

  resultCard: {
    backgroundColor: colors.surface, borderRadius: 24, padding: 24,
    marginBottom: 16,
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
  goalBadge:  { backgroundColor: `${colors.mint}25`, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  goalBadgeText: { fontSize: 12, fontWeight: '700', color: colors.mint },

  coachCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    backgroundColor: colors.surface, borderRadius: 18, padding: 18,
    marginBottom: 28, borderLeftWidth: 3, borderLeftColor: colors.mint,
  },
  coachIcon:  { fontSize: 22, marginTop: 2 },
  coachLabel: { fontSize: 11, fontWeight: '700', color: colors.mint, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  coachText:  { fontSize: 14, color: colors.textSecondary, lineHeight: 22 },

  questionTitle: { fontSize: 20, fontWeight: '800', color: colors.textPrimary, letterSpacing: -0.4, marginBottom: 14 },

  choiceCard: {
    backgroundColor: colors.surface, borderRadius: 20, padding: 18,
    flexDirection: 'row', alignItems: 'center', gap: 14,
    borderWidth: 1.5, borderColor: colors.borderSoft,
    marginBottom: 10,
  },
  choiceCardSelected: { borderColor: colors.mint, borderWidth: 2 },
  choiceEmoji: { fontSize: 28 },
  choiceBody:  { flex: 1, gap: 2 },
  choiceTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  choiceDesc:  { fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
  choiceCheck: {
    width: 24, height: 24, borderRadius: 12,
    borderWidth: 1.5, borderColor: colors.borderSoft,
    alignItems: 'center', justifyContent: 'center',
  },
  choiceCheckSelected: { backgroundColor: colors.mint, borderColor: colors.mint },
  choiceCheckMark: { fontSize: 12, fontWeight: '700', color: '#fff', lineHeight: 14 },

  bottomBar: { paddingHorizontal: 20, paddingTop: 12, backgroundColor: colors.background },
  ctaBtn: {
    backgroundColor: colors.mint, borderRadius: 16, height: 56,
    alignItems: 'center', justifyContent: 'center',
  },
  ctaBtnSoft:     { backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.borderSoft },
  ctaBtnDisabled: { backgroundColor: colors.borderSoft },
  ctaBtnText:     { fontSize: 17, fontWeight: '700', color: '#fff', letterSpacing: -0.3 },
})

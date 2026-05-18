import { useState, useEffect, useRef } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Modal, Animated,
  ActivityIndicator, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native'
import { router } from 'expo-router'
import * as Linking from 'expo-linking'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colorsDark as colors } from '@repo/theme'
import { calculateBMI, getBMICategory } from '@repo/shared'
import { useAuthStore } from '../../store/auth'
import { useDietStore } from '../../store/diet'
import { useExerciseLogStore } from '../../store/exerciseLog'
import { useUIStore } from '../../store/ui'
import { supabase } from '../../lib/supabase'
import {
  requestNotificationPermission,
  scheduleAllNotifications,
  getNotificationStatus,
} from '../../lib/notifications'
import { requestHealthKitPermission } from '../../lib/health'

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: string }) {
  return <Text style={s.sectionLabel}>{children}</Text>
}

function InfoRow({
  label, value, valueColor, accent, last,
}: {
  label: string
  value: string
  valueColor?: string
  accent?: React.ReactNode
  last?: boolean
}) {
  return (
    <View style={[s.row, !last && s.rowDivider]}>
      <Text style={s.rowLabel}>{label}</Text>
      <View style={s.rowRight}>
        {accent}
        <Text style={[s.rowValue, valueColor ? { color: valueColor } : null]}>
          {value}
        </Text>
      </View>
    </View>
  )
}

function ActionRow({
  label, sublabel, onPress, destructive, last, chevron,
}: {
  label: string
  sublabel?: string
  onPress: () => void
  destructive?: boolean
  last?: boolean
  chevron?: boolean
}) {
  return (
    <TouchableOpacity
      style={[s.row, !last && s.rowDivider]}
      onPress={onPress}
      activeOpacity={0.6}
    >
      <View style={{ flex: 1 }}>
        <Text style={[s.rowLabel, destructive && { color: colors.error }]}>{label}</Text>
        {sublabel ? <Text style={s.rowSublabel}>{sublabel}</Text> : null}
      </View>
      {chevron && <Text style={s.chevron}>›</Text>}
    </TouchableOpacity>
  )
}

function MacroDot({ color }: { color: string }) {
  return <View style={[s.macroDot, { backgroundColor: color }]} />
}

function BmiBadge({ bmi }: { bmi: number }) {
  const label = getBMICategory(bmi)
  const bg =
    bmi < 18.5 ? colors.infoLight :
    bmi < 23   ? colors.successLight :
    bmi < 25   ? colors.warningLight :
                 colors.errorLight
  const fg =
    bmi < 18.5 ? colors.info :
    bmi < 23   ? colors.success :
    bmi < 25   ? colors.warning :
                 colors.error
  return (
    <View style={[s.badge, { backgroundColor: bg }]}>
      <Text style={[s.badgeText, { color: fg }]}>{label}</Text>
    </View>
  )
}

// ─── Screen ───────────────────────────────────────────────────────────────────

// ─── Notification Setting Modal ───────────────────────────────────────────────

const NOTIF_ITEMS = [
  { emoji: '🌅', text: '아침·점심·저녁 식단 기록 리마인더' },
  { emoji: '💬', text: '먹은 음식 기반 다음 끼니 조언' },
  { emoji: '🏃', text: '매일 17:30 운동 리마인더' },
  { emoji: '🔥', text: 'D-day 카운트다운 & 동기 부여' },
  { emoji: '⚖️', text: '3일마다 체중 기록 알림' },
]

function NotificationSettingModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [loading, setLoading] = useState(false)

  const handleAllow = async () => {
    setLoading(true)
    try {
      const granted = await requestNotificationPermission()
      if (granted) {
        const { bodyInfo, programStartedAt } = useAuthStore.getState()
        const targetDays = bodyInfo?.target_days ?? 14
        let daysLeft = targetDays
        if (programStartedAt) {
          const startStr = new Date(programStartedAt).toLocaleDateString('en-CA')
          const todayStr = new Date().toLocaleDateString('en-CA')
          const elapsed  = Math.floor((new Date(todayStr).getTime() - new Date(startStr).getTime()) / 86_400_000)
          daysLeft = Math.max(0, targetDays - elapsed)
        }
        await scheduleAllNotifications(daysLeft)
        Alert.alert('알림 설정 완료', '알림이 활성화됐어요!')
      } else {
        Alert.alert('권한 필요', '설정 앱에서 알림 권한을 허용해주세요.')
      }
    } finally {
      setLoading(false)
      onClose()
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={ns.root}>
        <View style={ns.nav}>
          <Text style={ns.navTitle}>알림 설정</Text>
        </View>

        <View style={ns.body}>
          <View style={ns.iconWrap}>
            <Text style={ns.iconEmoji}>🔔</Text>
          </View>

          <Text style={ns.title}>꼭 필요한 순간에만{'\n'}알려드려요</Text>
          <Text style={ns.desc}>코치가 딱 맞는 타이밍에 보내드려요</Text>

          <View style={ns.list}>
            {NOTIF_ITEMS.map((item, i) => (
              <View key={i} style={ns.listRow}>
                <View style={ns.listIconWrap}>
                  <Text style={ns.listEmoji}>{item.emoji}</Text>
                </View>
                <Text style={ns.listText}>{item.text}</Text>
              </View>
            ))}
          </View>

          <TouchableOpacity style={ns.allowBtn} onPress={handleAllow} disabled={loading} activeOpacity={0.85}>
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={ns.allowBtnText}>알림 받기</Text>
            }
          </TouchableOpacity>

          <TouchableOpacity onPress={onClose} activeOpacity={0.6} style={ns.skipBtn}>
            <Text style={ns.skipText}>닫기</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}

const ns = StyleSheet.create({
  root:        { flex: 1, backgroundColor: colors.background },
  nav:         { alignItems: 'center', paddingTop: 20, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderSoft },
  navTitle:    { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  body:        { flex: 1, alignItems: 'center', paddingHorizontal: 24, paddingTop: 36 },
  iconWrap:    { width: 80, height: 80, borderRadius: 24, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', marginBottom: 28, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 4 },
  iconEmoji:   { fontSize: 38 },
  title:       { fontSize: 28, fontWeight: '700', color: colors.textPrimary, letterSpacing: -0.6, textAlign: 'center', marginBottom: 8 },
  desc:        { fontSize: 15, color: colors.textSecondary, textAlign: 'center', marginBottom: 28, lineHeight: 22 },
  list:        { width: '100%', backgroundColor: colors.surface, borderRadius: 20, padding: 8, marginBottom: 32, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 2 },
  listRow:     { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 13, paddingHorizontal: 12 },
  listIconWrap:{ width: 36, height: 36, borderRadius: 10, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  listEmoji:   { fontSize: 18 },
  listText:    { fontSize: 14, fontWeight: '500', color: colors.textPrimary, flex: 1, lineHeight: 20 },
  allowBtn:    { width: '100%', height: 56, borderRadius: 16, backgroundColor: colors.textPrimary, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  allowBtnText:{ fontSize: 17, fontWeight: '700', color: '#fff', letterSpacing: -0.3 },
  skipBtn:     { paddingVertical: 10, paddingHorizontal: 20 },
  skipText:    { fontSize: 14, color: colors.textTertiary, fontWeight: '500' },
})

// ─── Feedback Modal ───────────────────────────────────────────────────────────

function FeedbackModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [text, setText]         = useState('')
  const [sending, setSending]   = useState(false)

  const translateY     = useRef(new Animated.Value(600)).current
  const overlayOpacity = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (visible) {
      translateY.setValue(600)
      overlayOpacity.setValue(0)
      Animated.parallel([
        Animated.timing(overlayOpacity, { toValue: 1, duration: 160, useNativeDriver: true }),
        Animated.spring(translateY, { toValue: 0, useNativeDriver: true, damping: 24, stiffness: 220 }),
      ]).start()
    }
  }, [visible])

  const handleClose = () => {
    Animated.parallel([
      Animated.timing(overlayOpacity, { toValue: 0, duration: 180, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 600, duration: 220, useNativeDriver: true }),
    ]).start(() => { setText(''); onClose() })
  }

  const handleSend = async () => {
    if (!text.trim()) return
    setSending(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      await supabase.from('feedbacks').insert({
        user_id: user?.id ?? null,
        content: text.trim(),
      })
      handleClose()
      setTimeout(() => Alert.alert('감사해요!', '소중한 피드백이 전달됐어요 🙏'), 400)
    } catch {
      Alert.alert('오류', '전송에 실패했어요. 다시 시도해주세요.')
    } finally {
      setSending(false)
    }
  }

  return (
    <Modal visible={visible} animationType="none" transparent onRequestClose={handleClose}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Animated.View style={[fb.overlay, { opacity: overlayOpacity }]}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={handleClose} />
          <Animated.View style={[fb.sheet, { transform: [{ translateY }] }]}>
            <View style={fb.handle} />
            <Text style={fb.title}>피드백 보내기</Text>
            <Text style={fb.sub}>불편한 점, 원하는 기능, 칭찬 모두 환영해요 😊</Text>
            <TextInput
              style={fb.input}
              value={text}
              onChangeText={setText}
              placeholder="자유롭게 적어주세요..."
              placeholderTextColor={colors.textTertiary}
              multiline
              numberOfLines={7}
              editable={!sending}
              textAlignVertical="top"
            />
            {sending ? (
              <View style={fb.loadingRow}>
                <ActivityIndicator color={colors.textPrimary} />
                <Text style={fb.loadingText}>전송 중...</Text>
              </View>
            ) : (
              <TouchableOpacity
                style={[fb.btn, !text.trim() && fb.btnDisabled]}
                onPress={handleSend}
                disabled={!text.trim()}
                activeOpacity={0.85}
              >
                <Text style={fb.btnText}>보내기</Text>
              </TouchableOpacity>
            )}
          </Animated.View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const fb = StyleSheet.create({
  overlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet:      { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingBottom: 40, paddingTop: 12, gap: 12 },
  handle:     { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.borderSoft, alignSelf: 'center', marginBottom: 8 },
  title:      { fontSize: 18, fontWeight: '700', color: colors.textPrimary, letterSpacing: -0.3 },
  sub:        { fontSize: 13, color: colors.textTertiary, marginTop: -4 },
  input:      { borderWidth: 1.5, borderColor: colors.borderSoft, borderRadius: 14, padding: 14, fontSize: 15, color: colors.textPrimary, minHeight: 180, textAlignVertical: 'top', backgroundColor: colors.background },
  loadingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 4 },
  loadingText:{ fontSize: 13, color: colors.textTertiary },
  btn:        { backgroundColor: colors.textPrimary, borderRadius: 14, height: 52, alignItems: 'center', justifyContent: 'center' },
  btnDisabled:{ opacity: 0.35 },
  btnText:    { fontSize: 15, fontWeight: '700', color: '#fff' },
})

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const insets = useSafeAreaInsets()
  const { session, bodyInfo, macroGoals, signOut } = useAuthStore()
  const [devOpen, setDevOpen] = useState(false)
  const [restartVisible, setRestartVisible] = useState(false)
  const [notifVisible, setNotifVisible] = useState(false)
  const [notifStatus, setNotifStatus] = useState<string>('undetermined')
  const [feedbackVisible, setFeedbackVisible] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)

  useEffect(() => {
    getNotificationStatus().then(setNotifStatus)
  }, [notifVisible])

  const bmi = bodyInfo ? calculateBMI(bodyInfo.weight, bodyInfo.height) : null
  const displayName = session?.user.nickname ?? session?.user.name ?? '사용자'
  const initial = displayName[0].toUpperCase()

  const handleSignOut = () => {
    Alert.alert('로그아웃', '정말 로그아웃 하시겠어요?', [
      { text: '취소', style: 'cancel' },
      { text: '로그아웃', style: 'destructive', onPress: signOut },
    ])
  }

  const handleDeleteAccount = () => {
    Alert.alert(
      '계정 탈퇴',
      '탈퇴하면 모든 데이터가 영구 삭제되며 복구할 수 없어요. 정말 탈퇴하시겠어요?',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '탈퇴하기',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              '마지막 확인',
              '식단·운동·체중 기록이 모두 삭제돼요. 계속할까요?',
              [
                { text: '취소', style: 'cancel' },
                { text: '영구 삭제', style: 'destructive', onPress: confirmDeleteAccount },
              ]
            )
          },
        },
      ]
    )
  }

  const confirmDeleteAccount = async () => {
    setDeleteLoading(true)
    try {
      const { data: { session: currentSession } } = await supabase.auth.getSession()
      if (!currentSession) throw new Error('세션 없음')
      const res = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/delete-account`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${currentSession.access_token}`,
            'Content-Type': 'application/json',
          },
        }
      )
      if (!res.ok) throw new Error('탈퇴 처리 중 오류가 발생했어요')
      await supabase.auth.signOut()
      useAuthStore.setState({
        session: null, bodyInfo: null, macroGoals: null,
        hasCompletedOnboarding: false, isPremium: false,
        selectedPlan: null, programStartedAt: null,
      })
    } catch (e: any) {
      Alert.alert('오류', e?.message ?? '탈퇴 처리 중 오류가 발생했어요. 다시 시도해주세요.')
    } finally {
      setDeleteLoading(false)
    }
  }

  const handleRestart = (clearRecords: boolean) => {
    setRestartVisible(false)
    if (clearRecords) {
      useDietStore.getState().clearAll?.()
      useExerciseLogStore.getState().clearAll?.()
    }
    // isPremium=false → paywall 거친 후 새 프로그램 시작
    useAuthStore.setState({ isPremium: false, selectedPlan: null, programStartedAt: null })
    router.replace('/onboarding?mode=regoal')
  }

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Page title ── */}
        <Text style={s.pageTitle}>프로필</Text>

        {/* ── User card ── */}
        <View style={s.card}>
          <View style={s.profileRow}>
            <View style={s.avatar}>
              <Text style={s.avatarInitial}>{initial}</Text>
            </View>
            <View style={s.profileInfo}>
              <Text style={s.profileName}>{displayName}</Text>
              <Text style={s.profileEmail}>{session?.user.email ?? ''}</Text>
            </View>
          </View>
        </View>

        {/* ── 피드백 ── */}
        <SectionLabel>피드백</SectionLabel>
        <View style={s.card}>
          <ActionRow
            label="문의 • 피드백 보내기"
            sublabel="불편한 점이나 원하는 기능을 알려주세요"
            onPress={() => setFeedbackVisible(true)}
            chevron
            last
          />
        </View>

        {/* ── 신체 정보 ── */}
        {bodyInfo && (
          <>
            <SectionLabel>신체 정보</SectionLabel>
            <View style={s.card}>
              <InfoRow label="키"   value={`${bodyInfo.height} cm`} />
              <InfoRow label="체중" value={`${bodyInfo.weight} kg`} />
              <InfoRow label="나이" value={`${bodyInfo.age}세`} />
              {bmi && (
                <InfoRow
                  label="BMI"
                  value={String(bmi)}
                  accent={<BmiBadge bmi={bmi} />}
                  last
                />
              )}
            </View>
          </>
        )}

        {/* ── 일일 목표 ── */}
        {macroGoals && (
          <>
            <SectionLabel>일일 목표</SectionLabel>
            <View style={s.card}>
              <InfoRow label="칼로리"  value={`${macroGoals.calories.toLocaleString()} kcal`} />
              <InfoRow
                label="탄수화물"
                value={`${macroGoals.carbs} g`}
                accent={<MacroDot color={colors.macroCarb} />}
              />
              <InfoRow
                label="단백질"
                value={`${macroGoals.protein} g`}
                accent={<MacroDot color={colors.macroProtein} />}
              />
              <InfoRow
                label="지방"
                value={`${macroGoals.fat} g`}
                accent={<MacroDot color={colors.macroFat} />}
                last
              />
            </View>
          </>
        )}

        {/* ── 알림 설정 ── */}
        <SectionLabel>알림</SectionLabel>
        <View style={s.card}>
          <ActionRow
            label="푸시 알림"
            sublabel={notifStatus === 'granted' ? '알림 켜짐' : '알림 꺼짐 · 탭해서 설정'}
            onPress={() => setNotifVisible(true)}
            chevron
            last
          />
        </View>

        {/* ── 계정 ── */}
        <SectionLabel>계정</SectionLabel>
        <View style={s.card}>
          <ActionRow
            label="구독 관리"
            sublabel="구독 취소 · 플랜 변경"
            onPress={() => Linking.openURL('https://apps.apple.com/account/subscriptions')}
            chevron
          />
          <ActionRow
            label="다시 시작하기"
            sublabel="새 목표로 프로그램을 재시작해요"
            onPress={() => setRestartVisible(true)}
            chevron
          />
          <ActionRow
            label="로그아웃"
            onPress={handleSignOut}
            destructive
          />
          <ActionRow
            label="계정 탈퇴"
            sublabel="모든 데이터가 영구 삭제돼요"
            onPress={handleDeleteAccount}
            destructive
            last
          />
        </View>

        {/* ── 개발자 도구 ── */}
        <SectionLabel>개발자 도구</SectionLabel>
        <View style={s.card}>
          <ActionRow
            label="개발자 도구"
            sublabel={devOpen ? '탭하여 접기' : '탭하여 펼치기'}
            onPress={() => setDevOpen((v) => !v)}
            chevron
            last={!devOpen}
          />

          {devOpen && (
            <>
              <ActionRow
                label="어제의 리포트"
                onPress={() => {
                  useUIStore.getState().triggerYesterdayReport()
                  router.push('/(tabs)/')
                }}
                chevron
              />
              <ActionRow
                label="Paywall 다시 보기"
                onPress={() => {
                  useAuthStore.setState({ isPremium: false, selectedPlan: null })
                  router.replace('/paywall')
                }}
                chevron
              />
              <ActionRow
                label="온보딩부터 다시 보기"
                onPress={() => {
                  useAuthStore.setState({ hasCompletedOnboarding: false, isPremium: false })
                  router.replace('/onboarding')
                }}
                chevron
              />
              <ActionRow
                label="운동 처방 화면"
                onPress={() => router.push('/(tabs)/exercise')}
                chevron
              />
              <ActionRow label="트래커 — 러닝"       onPress={() => router.push({ pathname: '/exercise-tracker', params: { name: '러닝',       plannedAmount: '5',   plannedUnit: 'km', plannedKcal: '350', category: 'outdoor' } })} chevron />
              <ActionRow label="트래커 — 파워워킹"   onPress={() => router.push({ pathname: '/exercise-tracker', params: { name: '파워워킹',   plannedAmount: '6',   plannedUnit: 'km', plannedKcal: '280', category: 'outdoor' } })} chevron />
              <ActionRow label="트래커 — 자전거"     onPress={() => router.push({ pathname: '/exercise-tracker', params: { name: '자전거',     plannedAmount: '15',  plannedUnit: 'km', plannedKcal: '320', category: 'outdoor' } })} chevron />
              <ActionRow label="트래커 — 줄넘기"     onPress={() => router.push({ pathname: '/exercise-tracker', params: { name: '줄넘기',     plannedAmount: '500', plannedUnit: '회', plannedKcal: '250', category: 'indoor'  } })} chevron />
              <ActionRow label="트래커 — 계단오르기" onPress={() => router.push({ pathname: '/exercise-tracker', params: { name: '계단오르기', plannedAmount: '20',  plannedUnit: '층', plannedKcal: '200', category: 'indoor'  } })} chevron />
              <ActionRow
                label="🏆 프로그램 완료 화면 테스트"
                sublabel="목업 데이터로 completion 화면 진입"
                onPress={() => router.push('/completion')}
                chevron
              />
              <ActionRow
                label="✅ 프리미엄 강제 설정 (테스트)"
                sublabel="결제 없이 홈으로 진입"
                onPress={async () => {
                  await useAuthStore.getState().setPremium('monthly')
                  router.replace('/(tabs)')
                }}
                chevron
              />
              <ActionRow
                label="🧪 RC Offerings 테스트"
                sublabel="RC에서 product 직접 fetch"
                onPress={async () => {
                  try {
                    const Purchases = (await import('react-native-purchases')).default
                    const offerings = await Purchases.getOfferings()
                    const pkgs = offerings.current?.availablePackages ?? []
                    Alert.alert('RC Offerings 결과', pkgs.length > 0
                      ? pkgs.map((p) => `${p.product.identifier}: ${p.product.priceString}`).join('\n')
                      : `❌ packages 없음\ncurrent: ${offerings.current ? 'exists' : 'null'}\nall keys: ${Object.keys(offerings.all).join(', ')}`)
                  } catch (e: any) {
                    Alert.alert('RC 오류', e?.message ?? String(e))
                  }
                }}
                chevron
              />
              <ActionRow
                label="🏥 HealthKit 권한 요청 테스트"
                sublabel="initHealthKit 호출 — 콘솔 로그 확인"
                onPress={async () => {
                  try {
                    const result = await requestHealthKitPermission()
                    Alert.alert('HealthKit 결과', result ? '✅ 성공 (initialized)' : '❌ 실패 (err 발생)')
                  } catch (e: any) {
                    Alert.alert('HealthKit 오류', e?.message ?? String(e))
                  }
                }}
                chevron
              />
              <ActionRow
                label="🗑 운동 기록 전체 리셋"
                sublabel="모든 운동 로그를 삭제해요"
                onPress={() => {
                  Alert.alert('운동 기록 리셋', '모든 운동 기록을 삭제할까요?', [
                    { text: '취소', style: 'cancel' },
                    {
                      text: '삭제', style: 'destructive',
                      onPress: () => {
                        useExerciseLogStore.getState().clearAll()
                        Alert.alert('완료', '운동 기록이 초기화됐어요.')
                      },
                    },
                  ])
                }}
                destructive
                last
              />
            </>
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      <NotificationSettingModal visible={notifVisible} onClose={() => setNotifVisible(false)} />
      <FeedbackModal visible={feedbackVisible} onClose={() => setFeedbackVisible(false)} />

      {/* 다시 시작하기 모달 */}
      <Modal visible={restartVisible} transparent animationType="fade" onRequestClose={() => setRestartVisible(false)}>
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>다시 시작하기</Text>
            <Text style={s.modalDesc}>새 목표를 설정하고 플랜을 결제하면{'\n'}오늘부터 새 프로그램이 시작돼요.</Text>
            <View style={s.modalNotice}>
              <Text style={s.modalNoticeText}>💡 목표 체중·운동 시간만 다시 설정하고 바로 결제로 넘어가요.</Text>
            </View>

            <TouchableOpacity style={s.modalBtn} onPress={() => handleRestart(false)} activeOpacity={0.85}>
              <Text style={s.modalBtnText}>기록 유지하고 재시작</Text>
              <Text style={s.modalBtnSub}>지금까지의 식단·운동 기록을 남겨요</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[s.modalBtn, s.modalBtnDestructive]} onPress={() => handleRestart(true)} activeOpacity={0.85}>
              <Text style={[s.modalBtnText, { color: colors.error }]}>기록 초기화 후 재시작</Text>
              <Text style={s.modalBtnSub}>모든 기록을 지우고 새로 시작해요</Text>
            </TouchableOpacity>

            <TouchableOpacity style={s.modalCancel} onPress={() => setRestartVisible(false)} activeOpacity={0.7}>
              <Text style={s.modalCancelText}>취소</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root:    { flex: 1, backgroundColor: colors.background },
  scroll:  { flex: 1 },
  content: { paddingHorizontal: 16, paddingBottom: 110 },

  pageTitle: {
    fontSize: 34, fontWeight: '800', color: colors.textPrimary,
    letterSpacing: -0.8, marginTop: 12, marginBottom: 20, marginLeft: 4,
  },

  // Card container
  card: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    marginBottom: 8,
    shadowColor: '#101828',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 2,
    overflow: 'hidden',
  },

  // Section label
  sectionLabel: {
    fontSize: 13, fontWeight: '600', color: colors.textTertiary,
    letterSpacing: 0.2, marginLeft: 4, marginBottom: 6, marginTop: 16,
  },

  // Rows
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14, minHeight: 52,
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSoft,
  },
  rowLabel:    { flex: 1, fontSize: 15, fontWeight: '500', color: colors.textPrimary },
  rowSublabel: { fontSize: 12, color: colors.textTertiary, marginTop: 1 },
  rowRight:    { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowValue:    { fontSize: 15, fontWeight: '500', color: colors.textSecondary },
  chevron:     { fontSize: 20, color: colors.textTertiary, marginLeft: 4 },

  // Profile header
  profileRow:   { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 14 },
  avatar: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: colors.mintLight, justifyContent: 'center', alignItems: 'center',
  },
  avatarInitial: { fontSize: 22, fontWeight: '700', color: colors.mint },
  profileInfo:   { flex: 1, gap: 3 },
  profileName:   { fontSize: 17, fontWeight: '700', color: colors.textPrimary, letterSpacing: -0.3 },
  profileEmail:  { fontSize: 13, color: colors.textSecondary },

  // BMI badge
  badge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 12, fontWeight: '600' },

  // Macro dot
  macroDot: { width: 8, height: 8, borderRadius: 4 },

  // Restart modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20,
  },
  modalCard: {
    width: '100%', backgroundColor: colors.surface, borderRadius: 24,
    padding: 24, gap: 10,
    shadowColor: '#101828', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12, shadowRadius: 24, elevation: 12,
  },
  modalTitle: { fontSize: 20, fontWeight: '800', color: colors.textPrimary, letterSpacing: -0.4, marginBottom: 2 },
  modalDesc:  { fontSize: 14, color: colors.textSecondary, lineHeight: 20, marginBottom: 6 },
  modalBtn: {
    backgroundColor: colors.background, borderRadius: 16,
    padding: 16, borderWidth: 1, borderColor: colors.borderSoft,
  },
  modalBtnDestructive: { borderColor: colors.error + '40' },
  modalBtnText: { fontSize: 15, fontWeight: '700', color: colors.textPrimary, marginBottom: 3 },
  modalBtnSub:  { fontSize: 12, color: colors.textTertiary },
  modalCancel: { alignItems: 'center', paddingVertical: 10 },
  modalCancelText: { fontSize: 15, fontWeight: '600', color: colors.textTertiary },
  modalNotice: {
    backgroundColor: colors.mintLight, borderRadius: 12, padding: 12, marginBottom: 2,
  },
  modalNoticeText: { fontSize: 12, color: colors.mint, fontWeight: '500', lineHeight: 18 },
})

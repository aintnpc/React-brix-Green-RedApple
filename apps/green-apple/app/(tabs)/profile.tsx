import { useState, useEffect, useRef } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Modal, Animated,
  ActivityIndicator, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors } from '@repo/theme'
import { useAuthStore } from '../../store/auth'
import { useDietStore } from '../../store/diet'
import { useExerciseLogStore } from '../../store/exerciseLog'
import { supabase } from '../../lib/supabase'
import { formatHeight, formatWeight } from '../../lib/locale'
import { t } from '../../lib/i18n'
import {
  requestNotificationPermission,
  scheduleAllNotifications,
  getNotificationStatus,
} from '../../lib/notifications'

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


// ─── Screen ───────────────────────────────────────────────────────────────────

// ─── Notification Setting Modal ───────────────────────────────────────────────

const NOTIF_ITEM_KEYS = [
  { emoji: '🌅', key: 'profile_notif_item1' as const },
  { emoji: '💬', key: 'profile_notif_item2' as const },
  { emoji: '🏃', key: 'profile_notif_item3' as const },
  { emoji: '🔥', key: 'profile_notif_item4' as const },
  { emoji: '⚖️', key: 'profile_notif_item5' as const },
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
        Alert.alert(t('profile_notif_granted'), t('profile_notif_granted_msg'))
      } else {
        Alert.alert(t('profile_notif_denied'), t('profile_notif_denied_msg'))
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
          <Text style={ns.navTitle}>{t('profile_notif_modal_title')}</Text>
        </View>

        <View style={ns.body}>
          <View style={ns.iconWrap}>
            <Text style={ns.iconEmoji}>🔔</Text>
          </View>

          <Text style={ns.title}>{t('profile_notif_modal_title2')}</Text>
          <Text style={ns.desc}>{t('profile_notif_modal_desc')}</Text>

          <View style={ns.list}>
            {NOTIF_ITEM_KEYS.map((item, i) => (
              <View key={i} style={ns.listRow}>
                <View style={ns.listIconWrap}>
                  <Text style={ns.listEmoji}>{item.emoji}</Text>
                </View>
                <Text style={ns.listText}>{t(item.key)}</Text>
              </View>
            ))}
          </View>

          <TouchableOpacity style={ns.allowBtn} onPress={handleAllow} disabled={loading} activeOpacity={0.85}>
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={ns.allowBtnText}>{t('profile_notif_allow_btn')}</Text>
            }
          </TouchableOpacity>

          <TouchableOpacity onPress={onClose} activeOpacity={0.6} style={ns.skipBtn}>
            <Text style={ns.skipText}>{t('profile_notif_close')}</Text>
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
      setTimeout(() => Alert.alert(t('profile_feedback_thanks_title'), t('profile_feedback_thanks_msg')), 400)
    } catch {
      Alert.alert(t('profile_error_title'), t('profile_feedback_error'))
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
            <Text style={fb.title}>{t('profile_feedback_modal_title')}</Text>
            <Text style={fb.sub}>{t('profile_feedback_modal_sub')}</Text>
            <TextInput
              style={fb.input}
              value={text}
              onChangeText={setText}
              placeholder={t('profile_feedback_placeholder')}
              placeholderTextColor={colors.textTertiary}
              multiline
              numberOfLines={7}
              editable={!sending}
              textAlignVertical="top"
            />
            {sending ? (
              <View style={fb.loadingRow}>
                <ActivityIndicator color={colors.textPrimary} />
                <Text style={fb.loadingText}>{t('profile_feedback_sending')}</Text>
              </View>
            ) : (
              <TouchableOpacity
                style={[fb.btn, !text.trim() && fb.btnDisabled]}
                onPress={handleSend}
                disabled={!text.trim()}
                activeOpacity={0.85}
              >
                <Text style={fb.btnText}>{t('profile_feedback_send_btn')}</Text>
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
  const { session, bodyInfo, macroGoals, signOut, selectedPlan, remainingSessions, consumeSession, unitSystem, setUnitSystem } = useAuthStore()
  const [restartVisible, setRestartVisible] = useState(false)
  const [notifVisible, setNotifVisible] = useState(false)
  const [notifStatus, setNotifStatus] = useState<string>('undetermined')
  const [feedbackVisible, setFeedbackVisible] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)

  useEffect(() => {
    getNotificationStatus().then(setNotifStatus)
  }, [notifVisible])

  const displayName = session?.user.nickname ?? session?.user.name ?? t('profile_default_name')
  const initial = displayName[0].toUpperCase()

  const handleSignOut = () => {
    Alert.alert(t('profile_signout'), t('profile_signout_confirm_msg'), [
      { text: t('profile_cancel'), style: 'cancel' },
      { text: t('profile_signout'), style: 'destructive', onPress: signOut },
    ])
  }

  const handleDeleteAccount = () => {
    Alert.alert(
      t('profile_delete_confirm1_title'),
      t('profile_delete_confirm1_msg'),
      [
        { text: t('profile_cancel'), style: 'cancel' },
        {
          text: t('profile_delete_btn'),
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              t('profile_delete_confirm2_title'),
              t('profile_delete_confirm2_msg'),
              [
                { text: t('profile_cancel'), style: 'cancel' },
                { text: t('profile_delete_permanent'), style: 'destructive', onPress: confirmDeleteAccount },
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
      if (!currentSession) throw new Error('no session')
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
      if (!res.ok) throw new Error(t('profile_delete_error'))
      await supabase.auth.signOut()
      useAuthStore.setState({
        session: null, bodyInfo: null, macroGoals: null,
        hasCompletedOnboarding: false, isPremium: false,
        selectedPlan: null, programStartedAt: null,
      })
    } catch (e: any) {
      Alert.alert(t('profile_error_title'), e?.message ?? t('profile_delete_error'))
    } finally {
      setDeleteLoading(false)
    }
  }

  const handleRestart = async (clearRecords: boolean) => {
    setRestartVisible(false)
    if (clearRecords) {
      useDietStore.getState().clearAll?.()
      useExerciseLogStore.getState().clearAll?.()
    }
    if (selectedPlan === '2week_x3' && (remainingSessions ?? 0) > 0) {
      // 이용권 차감 후 바로 재시작
      await consumeSession()
      router.replace('/onboarding?mode=regoal')
    } else {
      // 이용권 없음 → 페이월
      useAuthStore.setState({ isPremium: false, selectedPlan: null, programStartedAt: null })
      router.replace('/onboarding?mode=regoal')
    }
  }

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Page title ── */}
        <Text style={s.pageTitle}>{t('profile_title')}</Text>

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
        <SectionLabel>{t('profile_feedback_section')}</SectionLabel>
        <View style={s.card}>
          <ActionRow
            label={t('profile_feedback_label')}
            sublabel={t('profile_feedback_sub')}
            onPress={() => setFeedbackVisible(true)}
            chevron
            last
          />
        </View>

        {/* ── 신체 정보 ── */}
        {/* ── 단위 설정 ── */}
        <SectionLabel>{t('profile_unit_section')}</SectionLabel>
        <View style={s.card}>
          <View style={[s.row, { paddingVertical: 10 }]}>
            <Text style={s.rowLabel}>{t('profile_unit_label')}</Text>
            <View style={s.unitToggleWrap}>
              <TouchableOpacity
                style={[s.unitBtn, unitSystem === 'metric' && s.unitBtnActive]}
                onPress={() => setUnitSystem('metric')}
                activeOpacity={0.75}
              >
                <Text style={[s.unitBtnText, unitSystem === 'metric' && s.unitBtnTextActive]}>kg / cm</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.unitBtn, unitSystem === 'imperial' && s.unitBtnActive]}
                onPress={() => setUnitSystem('imperial')}
                activeOpacity={0.75}
              >
                <Text style={[s.unitBtnText, unitSystem === 'imperial' && s.unitBtnTextActive]}>lb / ft</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {bodyInfo && (
          <>
            <SectionLabel>{t('profile_body_section')}</SectionLabel>
            <View style={s.card}>
              <InfoRow label={t('profile_height')} value={formatHeight(bodyInfo.height, unitSystem)} />
              <InfoRow label={t('profile_weight')} value={formatWeight(bodyInfo.weight, unitSystem)} />
              <InfoRow label={t('profile_age')} value={t('profile_age_unit', bodyInfo.age)} last />
            </View>
          </>
        )}

        {/* ── 일일 목표 ── */}
        {macroGoals && (
          <>
            <SectionLabel>{t('profile_goals_section')}</SectionLabel>
            <View style={s.card}>
              <InfoRow label={t('profile_calories')} value={`${macroGoals.calories.toLocaleString()} kcal`} />
              <InfoRow
                label={t('profile_carbs')}
                value={`${macroGoals.carbs} g`}
                accent={<MacroDot color={colors.macroCarb} />}
              />
              <InfoRow
                label={t('profile_protein')}
                value={`${macroGoals.protein} g`}
                accent={<MacroDot color={colors.macroProtein} />}
              />
              <InfoRow
                label={t('profile_fat')}
                value={`${macroGoals.fat} g`}
                accent={<MacroDot color={colors.macroFat} />}
                last
              />
            </View>
          </>
        )}

        {/* ── 알림 설정 ── */}
        <SectionLabel>{t('profile_notif_section')}</SectionLabel>
        <View style={s.card}>
          <ActionRow
            label={t('profile_notif_label')}
            sublabel={notifStatus === 'granted' ? t('profile_notif_on') : t('profile_notif_off')}
            onPress={() => setNotifVisible(true)}
            chevron
            last
          />
        </View>

        {/* ── 계정 ── */}
        <SectionLabel>{t('profile_account_section')}</SectionLabel>
        <View style={s.card}>
          {selectedPlan === '2week_x3' && (
            <ActionRow
              label={t('profile_remaining_label')}
              sublabel={t('profile_remaining_sub', remainingSessions ?? 0)}
              onPress={() => {}}
            />
          )}
          <ActionRow
            label={t('profile_restart_label')}
            sublabel={t('profile_restart_sub')}
            onPress={() => setRestartVisible(true)}
            chevron
          />
          <ActionRow
            label={t('profile_signout')}
            onPress={handleSignOut}
            destructive
          />
          <ActionRow
            label={t('profile_delete_label')}
            sublabel={t('profile_delete_sub')}
            onPress={handleDeleteAccount}
            destructive
            last
          />
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      <NotificationSettingModal visible={notifVisible} onClose={() => setNotifVisible(false)} />
      <FeedbackModal visible={feedbackVisible} onClose={() => setFeedbackVisible(false)} />

      {/* 다시 시작하기 모달 */}
      <Modal visible={restartVisible} transparent animationType="fade" onRequestClose={() => setRestartVisible(false)}>
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>{t('profile_restart_modal_title')}</Text>
            {selectedPlan === '2week_x3' && (remainingSessions ?? 0) > 0 ? (
              <>
                <Text style={s.modalDesc}>{t('profile_restart_with_pass_desc')}</Text>
                <View style={s.modalNotice}>
                  <Text style={s.modalNoticeText}>{t('profile_restart_pass_notice', remainingSessions ?? 0, (remainingSessions ?? 1) - 1)}</Text>
                </View>
              </>
            ) : (
              <>
                <Text style={s.modalDesc}>{t('profile_restart_no_pass_desc')}</Text>
                <View style={s.modalNotice}>
                  <Text style={s.modalNoticeText}>{t('profile_restart_no_pass_notice')}</Text>
                </View>
              </>
            )}

            <TouchableOpacity style={s.modalBtn} onPress={() => handleRestart(false)} activeOpacity={0.85}>
              <Text style={s.modalBtnText}>{t('profile_restart_keep')}</Text>
              <Text style={s.modalBtnSub}>{t('profile_restart_keep_sub')}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[s.modalBtn, s.modalBtnDestructive]} onPress={() => handleRestart(true)} activeOpacity={0.85}>
              <Text style={[s.modalBtnText, { color: colors.error }]}>{t('profile_restart_clear')}</Text>
              <Text style={s.modalBtnSub}>{t('profile_restart_clear_sub')}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={s.modalCancel} onPress={() => setRestartVisible(false)} activeOpacity={0.7}>
              <Text style={s.modalCancelText}>{t('profile_cancel')}</Text>
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

  // Macro dot
  macroDot: { width: 8, height: 8, borderRadius: 4 },

  // Unit toggle
  unitToggleWrap: {
    flexDirection: 'row',
    backgroundColor: colors.background,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    overflow: 'hidden',
  },
  unitBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  unitBtnActive: {
    backgroundColor: colors.textPrimary,
  },
  unitBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  unitBtnTextActive: {
    color: '#fff',
  },

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

import { useRef, useEffect, useState, useCallback } from 'react'
import { randomUUID } from 'expo-crypto'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Animated,
  Modal,
  TextInput,
  Image,
  LayoutAnimation,
  Platform,
  UIManager,
  ActivityIndicator,
  KeyboardAvoidingView,
  Alert,
} from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import MapView, { Polyline, Marker, PROVIDER_DEFAULT } from 'react-native-maps'
import { SvgXml } from 'react-native-svg'
import { APPLE_1, APPLE_2, APPLE_3, APPLE_4, APPLE_5 } from '../../components/AppleSvgs'
import { useFocusEffect, router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors } from '@repo/theme'
import { getTodayString, calculateExerciseCalories } from '@repo/shared'
import type { FoodItem, MealLog, ExerciseLog } from '@repo/shared'
import { useAuthStore } from '../../store/auth'
import { useDietStore } from '../../store/diet'
import { useExerciseLogStore } from '../../store/exerciseLog'
import { useUIStore } from '../../store/ui'
import { useWeightLogStore } from '../../store/weightLog'
import { useCoachStore } from '../../store/coach'
import { analyzeFoodImage, analyzeFoodText } from '../../lib/ai'
import { schedulePostMealCoaching, sendOvereatNudge, sendUndereatingEncouragement, sendStreakEncouragement, getNotificationStatus, scheduleMorningMotivation, scheduleExerciseReminder, cancelExerciseReminder } from '../../lib/notifications'
import { getTodaySteps, stepsToKcal, getStepsByDateRange } from '../../lib/health'
import { useStepsLogStore } from '../../store/stepsLog'
import { supabase } from '../../lib/supabase'
import { kgToDisplay, displayToKg, weightUnit, kmToDisplay, distanceUnit } from '../../lib/locale'
import { t, isKorean } from '../../lib/i18n'

if (Platform.OS === 'android') {
  UIManager.setLayoutAnimationEnabledExperimental?.(true)
}

// ─── Constants ────────────────────────────────────────────────────────────────

type Difficulty = 'low' | 'medium' | 'high'
type MealPeriod = 'breakfast' | 'lunch' | 'dinner' | 'snack'

const EXERCISE_CATEGORY: Record<string, string> = {
  running:  'outdoor',
  walking:  'outdoor',
  cycling:  'outdoor',
  jumprope: 'indoor',
  stairs:   'indoor',
  dance:    'indoor',
}

const EXERCISE_META: {
  id: string; name: string; en: string; difficulty: Difficulty
  category: string; kcalPerKgPerMin: number; speedKmPerMin?: number
}[] = [
  { id: 'running',  name: '러닝',       en: 'Running',       difficulty: 'medium', category: 'outdoor', kcalPerKgPerMin: 0.133, speedKmPerMin: 0.133 },
  { id: 'walking',  name: '파워워킹',   en: 'Power Walking', difficulty: 'low',    category: 'outdoor', kcalPerKgPerMin: 0.063, speedKmPerMin: 0.1 },
  { id: 'cycling',  name: '자전거',     en: 'Cycling',       difficulty: 'medium', category: 'outdoor', kcalPerKgPerMin: 0.1,   speedKmPerMin: 0.333 },
  { id: 'jumprope', name: '줄넘기',     en: 'Jump Rope',     difficulty: 'high',   category: 'indoor',  kcalPerKgPerMin: 0.12 },
  { id: 'stairs',   name: '계단오르기', en: 'Stair Climb',   difficulty: 'medium', category: 'indoor',  kcalPerKgPerMin: 0.11 },
  { id: 'dance',    name: '댄스',       en: 'Dance',         difficulty: 'medium', category: 'indoor',  kcalPerKgPerMin: 0.08 },
]

function buildExerciseOptions(weightKg: number, goalKcal: number) {
  return EXERCISE_META.map((ex) => {
    const minutes = Math.max(10, Math.ceil(goalKcal / (ex.kcalPerKgPerMin * weightKg)))
    const kcal = calculateExerciseCalories(ex.id === 'jumprope' ? 'jump_rope' : ex.id, minutes, weightKg)
    const distanceKm = ex.speedKmPerMin
      ? Math.round(ex.speedKmPerMin * minutes * 10) / 10
      : null
    return { ...ex, minutes, kcal, distanceKm }
  })
}

const MEAL_PERIOD_META: Record<MealPeriod, { labelKey: 'diet_breakfast' | 'diet_lunch' | 'diet_dinner' | 'diet_snack'; emoji: string }> = {
  breakfast: { labelKey: 'diet_breakfast', emoji: '🌅' },
  lunch:     { labelKey: 'diet_lunch',     emoji: '☀️' },
  dinner:    { labelKey: 'diet_dinner',    emoji: '🌙' },
  snack:     { labelKey: 'diet_snack',     emoji: '🍎' },
}

function getMealPeriod(hour: number): MealPeriod {
  if (hour >= 5 && hour < 11) return 'breakfast'
  if (hour >= 11 && hour < 16) return 'lunch'
  return 'dinner'
}

// 현재 식사 시간에 이미 기록이 있으면 snack으로 전환
function getActiveMealType(hour: number, todayMeals: { meal_type: string }[]): MealPeriod {
  const base = getMealPeriod(hour)
  const alreadyLogged = todayMeals.some((m) => m.meal_type === base)
  return alreadyLogged ? 'snack' : base
}

function getMimeType(uri: string): 'image/jpeg' | 'image/png' | 'image/webp' {
  if (uri.endsWith('.png')) return 'image/png'
  if (uri.endsWith('.webp')) return 'image/webp'
  return 'image/jpeg'
}

function buildSummary(foods: FoodItem[]): string {
  const names = foods.map((f) => `${f.name} ${f.amount}`).join(', ')
  const total = foods.reduce((s, f) => s + (f.nutrition?.calories ?? 0), 0)
  return `${names} (${t('diet_summary_kcal', total)})`
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

// ─── Difficulty Badge ─────────────────────────────────────────────────────────

const DIFF_META: Record<Difficulty, { label: string; color: string }> = {
  low:    { label: 'Low',  color: '#34C759' },
  medium: { label: 'Med',  color: '#FF9500' },
  high:   { label: 'High', color: '#FF3B30' },
}

function DifficultyBadge({ level }: { level: Difficulty }) {
  const meta = DIFF_META[level]
  return (
    <View style={[diffBadge.wrap, { backgroundColor: meta.color + '18', borderColor: meta.color + '40' }]}>
      <View style={[diffBadge.dot, { backgroundColor: meta.color }]} />
      <Text style={[diffBadge.label, { color: meta.color }]}>{meta.label}</Text>
    </View>
  )
}

const diffBadge = StyleSheet.create({
  wrap:  { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, marginTop: 8, alignSelf: 'flex-start' },
  dot:   { width: 6, height: 6, borderRadius: 3 },
  label: { fontSize: 11, fontWeight: '700' },
})

// ─── Helpers ─────────────────────────────────────────────────────────────────

function scoreColor(score: number) {
  if (score < 40) return '#FF3B30'
  if (score < 70) return '#FF9500'
  return '#34C759'
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

// ─── Image Picker Sheet ───────────────────────────────────────────────────────

function ImagePickerSheet({ visible, onClose, onPickBase64, onTextInput }: {
  visible: boolean
  onClose: () => void
  onPickBase64: (uri: string, base64: string, mimeType: 'image/jpeg' | 'image/png' | 'image/webp') => void
  onTextInput: () => void
}) {
  const translateY     = useRef(new Animated.Value(400)).current
  const overlayOpacity = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (visible) {
      translateY.setValue(400)
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
      Animated.timing(translateY, { toValue: 400, duration: 220, useNativeDriver: true }),
    ]).start(() => onClose())
  }

  const launch = async (mode: 'camera' | 'gallery') => {
    handleClose()
    await new Promise((r) => setTimeout(r, 250))
    let result
    if (mode === 'camera') {
      await ImagePicker.requestCameraPermissionsAsync()
      result = await ImagePicker.launchCameraAsync({ quality: 0.3, base64: true })
    } else {
      await ImagePicker.requestMediaLibraryPermissionsAsync()
      result = await ImagePicker.launchImageLibraryAsync({ quality: 0.3, base64: true })
    }
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0]
      onPickBase64(asset.uri, asset.base64 ?? '', getMimeType(asset.uri))
    }
  }

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={handleClose}>
      <Animated.View style={[sheetStyles.overlay, { opacity: overlayOpacity }]}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={handleClose} />
        <Animated.View style={[sheetStyles.sheet, { transform: [{ translateY }] }]}>
          <View style={sheetStyles.handle} />
          <TouchableOpacity style={sheetStyles.option} onPress={() => launch('camera')} activeOpacity={0.7}>
            <Text style={sheetStyles.optionIcon}>📷</Text>
            <View>
              <Text style={sheetStyles.optionLabel}>{t('home_picker_camera')}</Text>
              <Text style={sheetStyles.optionSub}>{t('home_picker_camera_sub')}</Text>
            </View>
          </TouchableOpacity>
          <View style={sheetStyles.divider} />
          <TouchableOpacity style={sheetStyles.option} onPress={() => launch('gallery')} activeOpacity={0.7}>
            <Text style={sheetStyles.optionIcon}>🖼️</Text>
            <View>
              <Text style={sheetStyles.optionLabel}>{t('home_picker_gallery')}</Text>
              <Text style={sheetStyles.optionSub}>{t('home_picker_gallery_sub')}</Text>
            </View>
          </TouchableOpacity>
          <View style={sheetStyles.divider} />
          <TouchableOpacity style={sheetStyles.option} onPress={() => { onClose(); onTextInput() }} activeOpacity={0.7}>
            <Text style={sheetStyles.optionIcon}>✏️</Text>
            <View>
              <Text style={sheetStyles.optionLabel}>{t('home_picker_text')}</Text>
              <Text style={sheetStyles.optionSub}>{t('home_picker_text_sub')}</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity style={sheetStyles.cancel} onPress={handleClose} activeOpacity={0.7}>
            <Text style={sheetStyles.cancelText}>{t('home_picker_cancel')}</Text>
          </TouchableOpacity>
        </Animated.View>
      </Animated.View>
    </Modal>
  )
}

const sheetStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingBottom: 36, paddingTop: 12,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: colors.borderSoft, alignSelf: 'center', marginBottom: 20,
  },
  option:      { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 16 },
  optionIcon:  { fontSize: 28 },
  optionLabel: { fontSize: 16, fontWeight: '600', color: colors.textPrimary },
  optionSub:   { fontSize: 13, color: colors.textTertiary, marginTop: 2 },
  divider:     { height: 1, backgroundColor: colors.borderSoft },
  cancel: {
    marginTop: 12, paddingVertical: 14, alignItems: 'center',
    backgroundColor: colors.background, borderRadius: 14,
  },
  cancelText: { fontSize: 16, fontWeight: '600', color: colors.textSecondary },
})

// ─── Text Input Modal ─────────────────────────────────────────────────────────

function TextInputModal({ visible, onClose, onResult }: {
  visible: boolean
  onClose: () => void
  onResult: (foods: FoodItem[]) => void
}) {
  const [text, setText]           = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [analyzeStep, setAnalyzeStep] = useState('')
  const [error, setError]         = useState<string | null>(null)

  const translateY     = useRef(new Animated.Value(500)).current
  const overlayOpacity = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (visible) {
      translateY.setValue(500)
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
      Animated.timing(translateY, { toValue: 500, duration: 220, useNativeDriver: true }),
    ]).start(() => { setText(''); setError(null); onClose() })
  }

  const handleAnalyze = async () => {
    if (!text.trim()) return
    setAnalyzing(true); setError(null)
    try {
      setAnalyzeStep(t('home_analyze_step1'))
      const foods = await analyzeFoodText(text.trim())
      setAnalyzeStep(t('home_analyze_step2'))
      await new Promise((r) => setTimeout(r, 200))
      setAnalyzeStep(t('home_analyze_step3'))
      await new Promise((r) => setTimeout(r, 150))
      setText('')
      Animated.parallel([
        Animated.timing(overlayOpacity, { toValue: 0, duration: 180, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 500, duration: 220, useNativeDriver: true }),
      ]).start(() => { onClose(); onResult(foods) })
    } catch {
      setError(t('home_text_analyze_error'))
    } finally {
      setAnalyzing(false)
      setAnalyzeStep('')
    }
  }

  return (
    <Modal visible={visible} animationType="none" transparent onRequestClose={handleClose}>
      <Animated.View style={[tm.overlay, { opacity: overlayOpacity }]}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={handleClose} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <Animated.View style={[tm.sheet, { transform: [{ translateY }] }]}>
            <View style={tm.handle} />
            <Text style={tm.title}>{t('home_text_modal_title')}</Text>
            <Text style={tm.sub}>{t('home_text_modal_sub')}</Text>
            <TextInput
              style={tm.input}
              value={text}
              onChangeText={setText}
              placeholder={t('home_text_modal_placeholder')}
              placeholderTextColor={colors.textTertiary}
              multiline
              numberOfLines={4}
              editable={!analyzing}
            />
            {error && <Text style={tm.error}>{error}</Text>}
            {analyzing ? (
              <View style={tm.loadingRow}>
                <Text style={tm.loadingText}>{analyzeStep}</Text>
              </View>
            ) : (
              <TouchableOpacity
                style={[tm.btn, !text.trim() && tm.btnDisabled]}
                onPress={handleAnalyze}
                disabled={!text.trim()}
                activeOpacity={0.85}
              >
                <Text style={tm.btnText}>{t('home_text_modal_analyze')}</Text>
              </TouchableOpacity>
            )}
          </Animated.View>
        </KeyboardAvoidingView>
      </Animated.View>
    </Modal>
  )
}

const tm = StyleSheet.create({
  overlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet:      { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingBottom: 40, paddingTop: 12, gap: 12 },
  handle:     { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.borderSoft, alignSelf: 'center', marginBottom: 8 },
  title:      { fontSize: 18, fontWeight: '700', color: colors.textPrimary, letterSpacing: -0.3 },
  sub:        { fontSize: 13, color: colors.textTertiary, marginTop: -4 },
  input:      { borderWidth: 1.5, borderColor: colors.borderSoft, borderRadius: 14, padding: 14, fontSize: 15, color: colors.textPrimary, minHeight: 100, textAlignVertical: 'top', backgroundColor: colors.background },
  error:      { fontSize: 13, color: '#FF3B30', textAlign: 'center' },
  loadingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 4 },
  loadingText:{ fontSize: 13, color: colors.textTertiary },
  btn:        { backgroundColor: colors.textPrimary, borderRadius: 14, height: 52, alignItems: 'center', justifyContent: 'center' },
  btnDisabled:{ opacity: 0.35 },
  btnText:    { fontSize: 15, fontWeight: '700', color: '#fff' },
})

// ─── Confirm Sheet ────────────────────────────────────────────────────────────

function ConfirmSheet({ visible, imageUri, summary, onConfirm, onReanalyze, onClose }: {
  visible: boolean
  imageUri: string
  summary: string
  onConfirm: () => void
  onReanalyze: (editedText: string, setStep: (s: string) => void) => Promise<void>
  onClose: () => void
}) {
  const translateY     = useRef(new Animated.Value(500)).current
  const overlayOpacity = useRef(new Animated.Value(0)).current
  const [editing, setEditing]       = useState(false)
  const [editText, setEditText]     = useState(summary)
  const [reanalyzing, setReanalyzing] = useState(false)
  const [reanalyzeStep, setReanalyzeStep] = useState('')

  useEffect(() => {
    setEditText(summary)
    setEditing(false)
  }, [summary, visible])

  useEffect(() => {
    if (visible) {
      translateY.setValue(500)
      overlayOpacity.setValue(0)
      Animated.parallel([
        Animated.timing(overlayOpacity, { toValue: 1, duration: 160, useNativeDriver: true }),
        Animated.spring(translateY, { toValue: 0, useNativeDriver: true, damping: 22, stiffness: 200 }),
      ]).start()
    }
  }, [visible])

  const handleClose = () => {
    Animated.parallel([
      Animated.timing(overlayOpacity, { toValue: 0, duration: 180, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 500, duration: 220, useNativeDriver: true }),
    ]).start(() => onClose())
  }

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={handleClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <Animated.View style={[confirmStyles.overlay, { opacity: overlayOpacity }]}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={handleClose} />
        <Animated.View style={[confirmStyles.sheet, { transform: [{ translateY }] }]}>
          <View style={confirmStyles.handle} />

          {/* Preview image */}
          {imageUri ? (
            <Image source={{ uri: imageUri }} style={confirmStyles.previewImg} resizeMode="cover" />
          ) : (
            <View style={[confirmStyles.previewImg, { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }]}>
              <Text style={{ fontSize: 32 }}>📝</Text>
            </View>
          )}

          {/* Summary */}
          <View style={confirmStyles.summaryBox}>
            {editing ? (
              <TextInput
                style={confirmStyles.editInput}
                value={editText}
                onChangeText={setEditText}
                multiline
                autoFocus
                returnKeyType="done"
              />
            ) : (
              <Text style={confirmStyles.summaryText}>{summary}</Text>
            )}
          </View>

          <Text style={confirmStyles.question}>{t('home_confirm_question')}</Text>

          {reanalyzing && (
            <Text style={{ textAlign: 'center', fontSize: 13, color: colors.mint, marginBottom: 8 }}>
              {reanalyzeStep}
            </Text>
          )}
          <View style={confirmStyles.btnRow}>
            {editing ? (
              <TouchableOpacity
                style={[confirmStyles.btn, confirmStyles.btnPrimary, reanalyzing && { opacity: 0.5 }]}
                disabled={reanalyzing}
                onPress={async () => {
                  setReanalyzing(true)
                  setReanalyzeStep(t('home_analyze_step1'))
                  try {
                    await onReanalyze(editText, setReanalyzeStep)
                  } finally {
                    setReanalyzing(false)
                    setReanalyzeStep('')
                    setEditing(false)
                  }
                }}
                activeOpacity={0.85}
              >
                <Text style={confirmStyles.btnTextPrimary}>{reanalyzing ? reanalyzeStep : t('home_confirm_reanalyze')}</Text>
              </TouchableOpacity>
            ) : (
              <>
                <TouchableOpacity
                  style={[confirmStyles.btn, confirmStyles.btnSecondary]}
                  onPress={() => setEditing(true)}
                  activeOpacity={0.8}
                >
                  <Text style={confirmStyles.btnTextSecondary}>{t('home_confirm_no')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[confirmStyles.btn, confirmStyles.btnPrimary]}
                  onPress={onConfirm}
                  activeOpacity={0.85}
                >
                  <Text style={confirmStyles.btnTextPrimary}>{t('home_confirm_yes')}</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </Animated.View>
      </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const confirmStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: 20, paddingBottom: 40, paddingTop: 12,
    gap: 16,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: colors.borderSoft, alignSelf: 'center', marginBottom: 4,
  },
  previewImg: {
    width: '100%', height: 180, borderRadius: 16, backgroundColor: colors.background,
  },
  summaryBox: {
    backgroundColor: colors.background, borderRadius: 14, padding: 14,
    minHeight: 52, justifyContent: 'center',
  },
  summaryText: { fontSize: 14, color: colors.textPrimary, lineHeight: 20 },
  editInput: {
    fontSize: 14, color: colors.textPrimary, lineHeight: 20,
    minHeight: 40, textAlignVertical: 'top',
  },
  question: { fontSize: 13, color: colors.textTertiary, textAlign: 'center' },
  btnRow: { flexDirection: 'row', gap: 10 },
  btn: { flex: 1, paddingVertical: 15, borderRadius: 16, alignItems: 'center' },
  btnPrimary:       { backgroundColor: colors.textPrimary },
  btnSecondary:     { backgroundColor: colors.background, borderWidth: 1.5, borderColor: colors.borderSoft },
  btnTextPrimary:   { fontSize: 15, fontWeight: '700', color: '#fff' },
  btnTextSecondary: { fontSize: 15, fontWeight: '600', color: colors.textSecondary },
})

// ─── Yesterday Report Modal ───────────────────────────────────────────────────

const CRAWL_CONTAINER_H = 230
const CRAWL_DURATION    = 5800

type CrawlRow =
  | { kind: 'meal';  label: string }
  | { kind: 'food';  name: string; kcal: number }
  | { kind: 'total'; label: string; kcal: number }
  | { kind: 'gap' }

function buildCrawlRows(meals: MealLog[], totalBurned: number): CrawlRow[] {
  const rows: CrawlRow[] = []
  const byPeriod: Record<string, { label: string; foods: { name: string; kcal: number }[] }> = {
    breakfast: { label: `🌅 ${t('diet_breakfast')}`, foods: [] },
    lunch:     { label: `☀️ ${t('diet_lunch')}`,     foods: [] },
    dinner:    { label: `🌙 ${t('diet_dinner')}`,    foods: [] },
    snack:     { label: `🍎 ${t('diet_snack')}`,     foods: [] },
  }
  for (const log of meals) {
    const period = byPeriod[log.meal_type]
    if (!period) continue
    for (const f of log.foods) {
      period.foods.push({ name: f.name, kcal: f.nutrition?.calories ?? 0 })
    }
  }
  const totalKcal = meals.reduce((s, m) => s + m.total_nutrition.calories, 0)
  for (const period of Object.values(byPeriod)) {
    if (period.foods.length === 0) continue
    rows.push({ kind: 'meal', label: period.label })
    period.foods.forEach((f) => rows.push({ kind: 'food', name: f.name, kcal: f.kcal }))
    rows.push({ kind: 'gap' })
  }
  rows.push({ kind: 'total', label: t('home_crawl_total_intake'),    kcal: totalKcal })
  rows.push({ kind: 'total', label: t('home_crawl_exercise_burned'), kcal: totalBurned })
  rows.push({ kind: 'total', label: t('home_crawl_net_kcal'),        kcal: totalKcal - totalBurned })
  return rows
}

// Row heights used to compute total content height
const ROW_H: Record<CrawlRow['kind'], number> = {
  meal: 38, food: 30, total: 34, gap: 12,
}

function CrawlRowView({ row }: { row: CrawlRow }) {
  if (row.kind === 'gap') return <View style={{ height: ROW_H.gap }} />
  if (row.kind === 'meal') {
    return (
      <View style={yrStyles.crawlMealRow}>
        <Text style={yrStyles.crawlMealLabel}>{row.label}</Text>
      </View>
    )
  }
  if (row.kind === 'food') {
    return (
      <View style={yrStyles.crawlFoodRow}>
        <Text style={yrStyles.crawlFoodName}>{row.name}</Text>
        <Text style={yrStyles.crawlFoodKcal}>{row.kcal} kcal</Text>
      </View>
    )
  }
  // total
  return (
    <View style={yrStyles.crawlTotalRow}>
      <Text style={yrStyles.crawlTotalLabel}>{row.label}</Text>
      <Text style={yrStyles.crawlTotalKcal}>{row.kcal} kcal</Text>
    </View>
  )
}

function YesterdayReportModal({ visible, onDismiss, meals, exercises }: {
  visible: boolean
  onDismiss: () => void
  meals: MealLog[]
  exercises: ExerciseLog[]
}) {
  const [phase, setPhase] = useState<'crawl' | 'result' | 'weight'>('crawl')
  const [dots, setDots]   = useState(1)
  const [exCount, setExCount] = useState(0)

  const { shouldPromptToday, getLatest, addEntry } = useWeightLogStore()
  const unitSystem = useAuthStore((s) => s.unitSystem)
  const wUnit = weightUnit(unitSystem)
  const today = getTodayString()
  const latest = getLatest()
  const onboardingWeight = useAuthStore.getState().bodyInfo?.weight ?? 60
  // weightVal은 항상 kg (내부 저장 단위)
  const [weightVal, setWeightVal] = useState(latest?.weight ?? onboardingWeight)

  const totalBurned = exercises.reduce((s, e) => s + (e.calories_burned ?? 0), 0)
  const totalKcal   = meals.reduce((s, m) => s + m.total_nutrition.calories, 0)
  const topFood     = meals.flatMap((m) => m.foods).sort((a, b) => (b.nutrition?.calories ?? 0) - (a.nutrition?.calories ?? 0))[0]
  const topEx       = exercises[0] ?? null

  const scrollAnim    = useRef(new Animated.Value(0)).current
  const resultOpacity = useRef(new Animated.Value(0)).current
  const weightOpacity = useRef(new Animated.Value(0)).current
  const exCountAnim   = useRef(new Animated.Value(0)).current

  const crawlRows  = buildCrawlRows(meals, totalBurned)
  const contentH   = crawlRows.reduce((s, r) => s + ROW_H[r.kind], 0) + 40
  const translateY = scrollAnim.interpolate({
    inputRange:  [0, 1],
    outputRange: [CRAWL_CONTAINER_H + 20, -contentH],
  })

  useEffect(() => {
    if (!visible) {
      setPhase('crawl')
      setDots(1)
      setExCount(0)
      const fallbackWeight = useAuthStore.getState().bodyInfo?.weight ?? 60
      setWeightVal(useWeightLogStore.getState().getLatest()?.weight ?? fallbackWeight)
      scrollAnim.setValue(0)
      resultOpacity.setValue(0)
      weightOpacity.setValue(0)
      exCountAnim.setValue(0)
      return
    }

    const dotTimer = setInterval(() => setDots((d) => (d >= 3 ? 1 : d + 1)), 500)

    Animated.timing(scrollAnim, {
      toValue: 1, duration: CRAWL_DURATION, useNativeDriver: true,
    }).start(() => {
      clearInterval(dotTimer)
      setPhase('result')
      Animated.timing(resultOpacity, { toValue: 1, duration: 500, useNativeDriver: true }).start()

      exCountAnim.setValue(0)
      const target = topEx?.amount ?? totalBurned
      const listener = exCountAnim.addListener(({ value }) => setExCount(Math.round(value)))
      Animated.timing(exCountAnim, {
        toValue: target, duration: 1600, useNativeDriver: false,
      }).start(() => exCountAnim.removeListener(listener))
    })

    return () => { clearInterval(dotTimer); exCountAnim.removeAllListeners() }
  }, [visible])

  const handleResultConfirm = () => {
    if (shouldPromptToday(today)) {
      setPhase('weight')
      Animated.timing(weightOpacity, { toValue: 1, duration: 400, useNativeDriver: true }).start()
    } else {
      onDismiss()
    }
  }

  const handleWeightSave = () => {
    addEntry({ date: today, weight: weightVal })
    const { bodyInfo, programStartedAt } = useAuthStore.getState()
    if (bodyInfo && programStartedAt) {
      useCoachStore.getState().recalculate(bodyInfo, programStartedAt, 0, 0, weightVal)
    }
    onDismiss()
  }

  // delta는 항상 kg 단위 (0.1kg or 0.5lb→0.226kg)
  const adjustWeight = (delta: number) =>
    setWeightVal((v) => Math.round((Math.max(30, Math.min(200, v + delta))) * 10) / 10)

  const dispWeightVal = kgToDisplay(weightVal, unitSystem)

  // Compute program day for display
  const programDay = useWeightLogStore.getState().getProgramDay(today)

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={yrStyles.overlay}>
        <View style={yrStyles.card}>

          {/* Header */}
          <View style={yrStyles.header}>
            <Text style={yrStyles.eyebrow}>
              {phase === 'weight' ? t('home_report_weight_header') : t('home_report_header')}
            </Text>
            <Text style={yrStyles.dateText}>
              {phase === 'weight'
                ? t('home_report_dplus', programDay)
                : (() => { const d = new Date(); d.setDate(d.getDate() - 1); return t('home_report_yesterday_date', d.getMonth() + 1, d.getDate()) })()
              }
            </Text>
          </View>

          {/* ── Crawl phase ── */}
          {phase === 'crawl' && (
            <>
              <View style={yrStyles.crawlOuter}>
                <View style={yrStyles.crawlFadeTop} pointerEvents="none" />
                <View style={{ height: CRAWL_CONTAINER_H, overflow: 'hidden' }}>
                  <Animated.View style={{ transform: [{ translateY }] }}>
                    {crawlRows.map((row, i) => <CrawlRowView key={i} row={row} />)}
                  </Animated.View>
                </View>
                <View style={yrStyles.crawlFadeBottom} pointerEvents="none" />
              </View>
              <View style={yrStyles.analyzingRow}>
                <ActivityIndicator size="small" color={colors.mint} style={{ marginRight: 8 }} />
                <Text style={yrStyles.analyzingText}>{t('home_report_analyzing')}{'·'.repeat(dots)}</Text>
              </View>
            </>
          )}

          {/* ── Result phase ── */}
          {phase === 'result' && (
            <Animated.View style={[yrStyles.resultWrap, { opacity: resultOpacity }]}>
              <View style={yrStyles.summaryBox}>
                <Text style={yrStyles.summaryText}>
                  {meals.length === 0
                    ? t('home_report_no_meals')
                    : topFood
                      ? t('home_report_meal_summary', topFood.name, totalKcal)
                      : t('home_report_kcal_only', totalKcal)
                  }
                </Text>
              </View>
              {topEx ? (
                <View style={yrStyles.exBox}>
                  <Text style={yrStyles.exEyebrow}>{t('home_report_exercise_label')}</Text>
                  <Text style={yrStyles.exName}>
                    {topEx.exercise.name}
                    {topEx.duration_minutes != null && (
                      <Text style={yrStyles.exMinutes}>  ·  {topEx.duration_minutes}{t('home_unit_min')}</Text>
                    )}
                  </Text>
                  <View style={yrStyles.exCountRow}>
                    <Text style={yrStyles.exCount}>{exCount.toLocaleString()}</Text>
                    <Text style={yrStyles.exUnit}>kcal</Text>
                  </View>
                  <Text style={yrStyles.exKcal}>{t('home_report_kcal_burned', topEx.calories_burned ?? 0)}</Text>
                </View>
              ) : (
                <View style={yrStyles.exBox}>
                  <Text style={yrStyles.exEyebrow}>{t('home_report_exercise_label')}</Text>
                  <Text style={[yrStyles.exName, { color: colors.textTertiary }]}>{t('home_report_no_exercise')}</Text>
                </View>
              )}
              <TouchableOpacity style={yrStyles.confirmBtn} onPress={handleResultConfirm} activeOpacity={0.82}>
                <Text style={yrStyles.confirmText}>{t('home_report_confirm')}</Text>
              </TouchableOpacity>
            </Animated.View>
          )}

          {/* ── Weight input phase ── */}
          {phase === 'weight' && (
            <Animated.View style={[yrStyles.weightWrap, { opacity: weightOpacity }]}>
              <Text style={yrStyles.weightHint}>{t('home_weight_hint')}</Text>

              {/* Stepper */}
              <View style={yrStyles.stepper}>
                <TouchableOpacity style={yrStyles.stepBtn} onPress={() => adjustWeight(unitSystem === 'imperial' ? -0.5 / 2.2046 : -0.1)} activeOpacity={0.7}>
                  <Text style={yrStyles.stepBtnText}>－</Text>
                </TouchableOpacity>
                <View style={yrStyles.stepDisplay}>
                  <TextInput
                    style={yrStyles.stepNum}
                    value={dispWeightVal.toFixed(1)}
                    onChangeText={(v) => {
                      const n = parseFloat(v)
                      if (!isNaN(n) && n > 0 && n < 660) setWeightVal(displayToKg(Math.round(n * 10) / 10, unitSystem))
                    }}
                    keyboardType="decimal-pad"
                    selectTextOnFocus
                  />
                  <Text style={yrStyles.stepUnit}>{wUnit}</Text>
                </View>
                <TouchableOpacity style={yrStyles.stepBtn} onPress={() => adjustWeight(unitSystem === 'imperial' ? 0.5 / 2.2046 : 0.1)} activeOpacity={0.7}>
                  <Text style={yrStyles.stepBtnText}>＋</Text>
                </TouchableOpacity>
              </View>

              {latest && (
                <Text style={yrStyles.weightPrev}>
                  {t('home_weight_prev')}  {kgToDisplay(latest.weight, unitSystem).toFixed(1)} {wUnit}
                  {weightVal !== latest.weight
                    ? `  (${weightVal > latest.weight ? '+' : ''}${(kgToDisplay(weightVal, unitSystem) - kgToDisplay(latest.weight, unitSystem)).toFixed(1)} ${wUnit})`
                    : ''}
                </Text>
              )}

              <TouchableOpacity style={yrStyles.confirmBtn} onPress={handleWeightSave} activeOpacity={0.82}>
                <Text style={yrStyles.confirmText}>{t('home_weight_save')}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={onDismiss} activeOpacity={0.6} style={{ alignItems: 'center', paddingTop: 12 }}>
                <Text style={yrStyles.skipText}>{t('home_weight_skip')}</Text>
              </TouchableOpacity>
            </Animated.View>
          )}

        </View>
      </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const yrStyles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20,
  },
  card: {
    width: '100%', backgroundColor: colors.surface, borderRadius: 24,
    paddingTop: 24, paddingBottom: 20, paddingHorizontal: 20,
    shadowColor: '#101828', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12, shadowRadius: 24, elevation: 12,
  },

  header: { alignItems: 'center', marginBottom: 20, gap: 2 },
  eyebrow: {
    fontSize: 11, fontWeight: '700', letterSpacing: 1.2,
    textTransform: 'uppercase', color: colors.textTertiary,
  },
  dateText: { fontSize: 20, fontWeight: '700', color: colors.textPrimary, letterSpacing: -0.4 },

  crawlOuter: { marginHorizontal: -20, position: 'relative' },
  crawlFadeTop: {
    position: 'absolute', top: 0, left: 0, right: 0, height: 48, zIndex: 2,
    backgroundColor: colors.surface, opacity: 0.9,
  },
  crawlFadeBottom: {
    position: 'absolute', bottom: 0, left: 0, right: 0, height: 48, zIndex: 2,
    backgroundColor: colors.surface, opacity: 0.9,
  },
  crawlMealRow: {
    height: ROW_H.meal, justifyContent: 'flex-end', paddingBottom: 4,
    paddingHorizontal: 20, marginTop: 4,
  },
  crawlMealLabel: { fontSize: 13, fontWeight: '700', color: colors.textSecondary, letterSpacing: 0.2 },
  crawlFoodRow: {
    height: ROW_H.food, flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingHorizontal: 20,
  },
  crawlFoodName: { fontSize: 15, fontWeight: '500', color: colors.textPrimary },
  crawlFoodKcal: { fontSize: 13, color: colors.textTertiary },
  crawlTotalRow: {
    height: ROW_H.total, flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingHorizontal: 20,
    borderTopWidth: 1, borderTopColor: colors.borderSoft,
  },
  crawlTotalLabel: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  crawlTotalKcal:  { fontSize: 13, fontWeight: '700', color: colors.textPrimary },

  analyzingRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingTop: 16, paddingBottom: 4,
  },
  analyzingText: { fontSize: 13, color: colors.textTertiary, fontWeight: '500' },

  resultWrap: { gap: 14 },
  summaryBox: { backgroundColor: colors.mintLight, borderRadius: 14, padding: 16 },
  summaryText: {
    fontSize: 15, fontWeight: '500', color: colors.textPrimary,
    lineHeight: 24, letterSpacing: -0.2,
  },
  exBox: {
    backgroundColor: colors.background, borderRadius: 16,
    paddingVertical: 18, paddingHorizontal: 20, alignItems: 'center', gap: 3,
  },
  exEyebrow: {
    fontSize: 11, fontWeight: '700', color: colors.textTertiary,
    letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 4,
  },
  exName:     { fontSize: 16, fontWeight: '600', color: colors.textPrimary, letterSpacing: -0.2 },
  exMinutes:  { fontSize: 14, fontWeight: '400', color: colors.textTertiary },
  exCountRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, marginVertical: 4 },
  exCount:    { fontSize: 54, fontWeight: '800', color: colors.textPrimary, letterSpacing: -2, lineHeight: 62 },
  exUnit:     { fontSize: 20, fontWeight: '600', color: colors.textSecondary, marginBottom: 6 },
  exKcal:     { fontSize: 13, color: colors.textTertiary, marginTop: 2 },

  confirmBtn: {
    backgroundColor: colors.textPrimary, borderRadius: 14,
    paddingVertical: 15, alignItems: 'center', marginTop: 2,
  },
  confirmText: { fontSize: 15, fontWeight: '700', color: colors.surface, letterSpacing: -0.2 },

  // Weight phase
  weightWrap:  { gap: 16, width: '100%' },
  weightHint:  { fontSize: 14, color: colors.textSecondary, textAlign: 'center' },
  stepper: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.background, borderRadius: 20,
    padding: 6, gap: 4, width: '100%',
  },
  stepBtn: {
    width: 52, height: 52, borderRadius: 14,
    backgroundColor: colors.surface, justifyContent: 'center', alignItems: 'center',
    shadowColor: '#101828', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 2, elevation: 2,
  },
  stepBtnText:  { fontSize: 24, fontWeight: '300', color: colors.textPrimary },
  stepDisplay:  { flex: 1, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 4 },
  stepNum:      { fontSize: 40, fontWeight: '800', color: colors.textPrimary, letterSpacing: -1 },
  stepUnit:     { fontSize: 18, fontWeight: '500', color: colors.textSecondary },
  weightPrev: { fontSize: 13, color: colors.textTertiary, textAlign: 'center' },
  skipText:   { fontSize: 14, color: colors.textTertiary, textAlign: 'center' },
})

// ─── Home Screen ──────────────────────────────────────────────────────────────

function calcStreak(logs: MealLog[], calorieGoal: number): number {
  const dateKcal = new Map<string, number>()
  for (const log of logs) {
    dateKcal.set(log.date, (dateKcal.get(log.date) ?? 0) + log.total_nutrition.calories)
  }
  let streak = 0
  const base = new Date()
  for (let i = 0; i < 365; i++) {
    const d = new Date(base)
    d.setDate(d.getDate() - i)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const kcal = dateKcal.get(key) ?? 0
    if (kcal > 0 && kcal <= calorieGoal * 1.15) streak++
    else break
  }
  return streak
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets()
  const { session, bodyInfo, macroGoals, isProgramEnded } = useAuthStore()
  const unitSystem = useAuthStore((s) => s.unitSystem)
  const { getTodayLogs, addMealLog, logs: allLogs, syncFromDB } = useDietStore()
  const { getTodayBurned, getTodayLogs: getTodayExLogs, logs: allExLogs } = useExerciseLogStore()
  const { showYesterdayReport, dismissYesterdayReport, checkAndTriggerDailyReport } = useUIStore()

  const { goals, loading: coachLoading, fetchPastLogs, recalculate } = useCoachStore()

  const [prescExpanded, setPrescExpanded] = useState(false)
  const [appleStage, setAppleStage] = useState(0)
  const appleTimers = useRef<ReturnType<typeof setTimeout>[]>([])
  const [todaySteps, setTodaySteps] = useState(0)

  // Yesterday's data for the report modal
  const yesterdayStr = (() => {
    const d = new Date(); d.setDate(d.getDate() - 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })()
  const yesterdayMeals = allLogs.filter((l) => l.date === yesterdayStr)
  const yesterdayExercises = allExLogs.filter((l) => l.date === yesterdayStr)

  useEffect(() => {
    if (coachLoading) return
    const targetStage = totalScore <= 20 ? 0 : totalScore <= 40 ? 1 : totalScore <= 60 ? 2 : totalScore <= 80 ? 3 : 4
    appleTimers.current.forEach(clearTimeout)
    setAppleStage(0)
    appleTimers.current = Array.from({ length: targetStage }, (_, i) =>
      setTimeout(() => setAppleStage(i + 1), (i + 1) * 300)
    )
    return () => appleTimers.current.forEach(clearTimeout)
  }, [coachLoading, totalScore])

  useFocusEffect(useCallback(() => {
    checkAndTriggerDailyReport()
    getTodaySteps().then((steps) => setTodaySteps(steps))
    const { session, bodyInfo, programStartedAt, isPremium } = useAuthStore.getState()

    // 어제 걸음 수 저장 (날짜가 바뀌었을 때)
    if (session && programStartedAt) {
      const { lastSavedDate, saveSteps, syncFromDB: syncSteps } = useStepsLogStore.getState()
      const todayStr = new Date().toLocaleDateString('en-CA')
      const yesterdayDate = new Date(); yesterdayDate.setDate(yesterdayDate.getDate() - 1)
      const yesterdayStr = yesterdayDate.toLocaleDateString('en-CA')
      const startStr = new Date(programStartedAt).toLocaleDateString('en-CA')

      // 어제 날짜가 아직 저장 안 됐으면 저장
      if (lastSavedDate !== yesterdayStr && yesterdayStr >= startStr) {
        getStepsByDateRange(yesterdayStr, yesterdayStr).then((byDate) => {
          const steps = byDate[yesterdayStr] ?? 0
          if (steps > 0) saveSteps(session.user.id, yesterdayStr, steps)
        })
      }

      // DB에서 전체 sync
      syncSteps(session.user.id, startStr)
    }
    if (session) {
      syncFromDB(session.user.id)
      if (bodyInfo && programStartedAt) {
        fetchPastLogs(session.user.id, bodyInfo, programStartedAt).then(() => {
          const { logs } = useDietStore.getState()
          const todayStr = new Date().toLocaleDateString('en-CA')
          const todayConsumed = logs
            .filter((l) => l.date === todayStr)
            .reduce((s, l) => s + l.total_nutrition.calories, 0)
          recalculate(bodyInfo, programStartedAt, todayConsumed, 0)
        })
      }
    }
    // 프로그램 완료 감지
    if (isPremium && bodyInfo && programStartedAt) {
      const targetDays = bodyInfo.target_days ?? 14
      const startDate = new Date(programStartedAt).toLocaleDateString('en-CA')
      const todayStr  = new Date().toLocaleDateString('en-CA')
      const elapsed   = Math.floor((new Date(todayStr).getTime() - new Date(startDate).getTime()) / 86_400_000)
      if (elapsed >= targetDays) {
        router.replace('/completion')
        return
      }
      // 실제 daysLeft로 아침 동기부여 알림 재스케줄
      const actualDaysLeft = Math.max(0, targetDays - elapsed)
      getNotificationStatus().then((status) => {
        if (status !== 'granted') return
        scheduleMorningMotivation(actualDaysLeft).catch(() => {})
        // 오늘 운동 기록 있으면 운동 리마인더 취소, 없으면 유지
        const todayBurned = useExerciseLogStore.getState().getTodayBurned(todayStr)
        if (todayBurned > 0) {
          cancelExerciseReminder().catch(() => {})
        } else {
          scheduleExerciseReminder().catch(() => {})
        }
      })
    }
  }, []))

  const [doneExercises, setDoneExercises] = useState<string[]>([])
  const [pickerVisible, setPickerVisible]   = useState(false)
  const [textModalVisible, setTextModalVisible] = useState(false)
  const [analyzing, setAnalyzing]         = useState(false)
  const [analyzeStep, setAnalyzeStep]     = useState('')

  // Meal period state
  const today = getTodayString()
  const todayMeals   = getTodayLogs(today)

  const currentPeriod = getActiveMealType(new Date().getHours(), todayMeals)
  const [savedPeriod, setSavedPeriod] = useState<MealPeriod>(currentPeriod)

  // Per-meal-period: photo + summary + foods
  const [mealPhoto, setMealPhoto]     = useState<string | null>(null)
  const [mealSummary, setMealSummary] = useState<string | null>(null)
  const [pendingFoods, setPendingFoods] = useState<FoodItem[]>([])

  // Confirm sheet state
  const [confirmVisible, setConfirmVisible]     = useState(false)
  const [pendingImageUri, setPendingImageUri]   = useState('')
  const [pendingSummary, setPendingSummary]     = useState('')

  // Reset local photo/summary when meal period changes
  useEffect(() => {
    if (currentPeriod !== savedPeriod) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
      setMealPhoto(null)
      setMealSummary(null)
      setSavedPeriod(currentPeriod)
    }
  }, [currentPeriod])

  const todayBurned  = getTodayBurned(today)
  const todayExLogs  = getTodayExLogs(today)

  const consumed = todayMeals.reduce(
    (acc, m) => ({
      calories: acc.calories + m.total_nutrition.calories,
      carbs:    acc.carbs    + m.total_nutrition.carbs,
      protein:  acc.protein  + m.total_nutrition.protein,
      fat:      acc.fat      + m.total_nutrition.fat,
    }),
    { calories: 0, carbs: 0, protein: 0, fat: 0 }
  )

  // 오늘 섭취/운동 변경 시 코치 재계산 (운동 기록 + 걸음 수 합산)
  useEffect(() => {
    const { bodyInfo, programStartedAt } = useAuthStore.getState()
    if (bodyInfo && programStartedAt) {
      const stepsKcal = stepsToKcal(todaySteps, bodyInfo.weight)
      recalculate(bodyInfo, programStartedAt, consumed.calories, todayBurned + stepsKcal)
    }
  }, [consumed.calories, todayBurned, todaySteps])

  // Card order: prescription rises once any meal has been saved today
  const hasSavedCurrentMeal = todayMeals.length > 0

  const calorieGoal = goals?.calorieGoal ?? macroGoals?.calories ?? 1700
  const targetDays  = bodyInfo?.target_days ?? 14
  const weightKg    = bodyInfo?.weight ?? 70

  const daysLeft = (() => {
    const { programStartedAt } = useAuthStore.getState()
    if (!programStartedAt) return targetDays
    const startDate = new Date(programStartedAt).toLocaleDateString('en-CA') // YYYY-MM-DD (local)
    const todayStr  = new Date().toLocaleDateString('en-CA')
    const elapsed   = Math.floor((new Date(todayStr).getTime() - new Date(startDate).getTime()) / 86_400_000)
    return Math.max(0, targetDays - elapsed)
  })()

  const userName = session?.user.nickname ?? session?.user.name ?? t('home_user_fallback')

  const exerciseGoalKcal = goals?.exerciseGoalKcal ?? 300
  const exerciseGoalKcalAdjusted = goals?.exerciseGoalKcalAdjusted ?? exerciseGoalKcal
  const exerciseAdjustmentKcal = goals?.exerciseAdjustmentKcal ?? 0  // 양수=초과, 음수=여유

  const EXERCISE_OPTIONS = buildExerciseOptions(weightKg, exerciseGoalKcal)
  const EXERCISE_OPTIONS_ADJUSTED = buildExerciseOptions(weightKg, exerciseGoalKcalAdjusted)

  const periodMeta = MEAL_PERIOD_META[currentPeriod]
  // 식단 점수: 목표 범위 안에 들어올수록 높음
  // 목표의 90~110% → 60점, 초과할수록 감점, 미달도 감점 (너무 안 먹는 것도 나쁨)
  const mealScore = (() => {
    if (consumed.calories === 0) return 0
    const ratio = consumed.calories / calorieGoal
    if (ratio >= 0.9 && ratio <= 1.1) return 60                          // 목표 범위 내 → 만점
    if (ratio > 1.1) return Math.max(0, Math.round(60 - (ratio - 1.1) * 200))  // 초과 → 감점
    return Math.max(0, Math.round(ratio / 0.9 * 60))                     // 미달 → 비례 점수
  })()

  // 운동 점수: 목표 달성률 기준 (초과 달성도 만점)
  const exScore = Math.round(Math.min(todayBurned / Math.max(exerciseGoalKcal, 1), 1) * 40)
  const totalScore = mealScore + exScore

  const [selectedExercise, setSelectedExercise] = useState(0)
  const activeEx = EXERCISE_OPTIONS[selectedExercise]
  const activeExAdjusted = EXERCISE_OPTIONS_ADJUSTED[selectedExercise]
  const diffMinutes = activeExAdjusted.minutes - activeEx.minutes  // 양수=추가, 음수=감소
  const diffKm = activeEx.distanceKm != null && activeExAdjusted.distanceKm != null
    ? Math.round((activeExAdjusted.distanceKm - activeEx.distanceKm) * 10) / 10
    : null
  const completedLog = todayExLogs.find((l) => l.exercise.name === activeEx.name)

  const scrollRef  = useRef<any>(null)
  const prescCardY = useRef(0)

  const endDate = (() => {
    const { programStartedAt } = useAuthStore.getState()
    const start = programStartedAt ? new Date(programStartedAt) : new Date()
    const end = new Date(start)
    end.setDate(end.getDate() + targetDays)
    return `${end.getMonth() + 1}/${end.getDate()}`
  })()

  const streak = calcStreak(allLogs, calorieGoal)
  const stagger = useStagger(5)

  const toggleExpand = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
    const next = !prescExpanded
    setPrescExpanded(next)
    if (next) {
      setTimeout(() => {
        scrollRef.current?.scrollTo({ y: prescCardY.current, animated: true })
      }, 80)
    }
  }

  const toggleExercise = (id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
    setDoneExercises((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  // ── Image analysis flow ────────────────────────────────────────────────────

  const handlePickedImage = async (uri: string, base64: string, mimeType: 'image/jpeg' | 'image/png' | 'image/webp') => {
    setAnalyzing(true)
    try {
      setAnalyzeStep(t('home_image_step1'))
      await new Promise((r) => setTimeout(r, 300))
      setAnalyzeStep(t('home_image_step2'))
      const foods = await analyzeFoodImage(base64, mimeType)
      setAnalyzeStep(t('home_analyze_step2'))
      await new Promise((r) => setTimeout(r, 200))
      setAnalyzeStep(t('home_analyze_step3'))
      await new Promise((r) => setTimeout(r, 150))
      const summary = buildSummary(foods)
      setPendingFoods(foods)
      setPendingImageUri(uri)
      setPendingSummary(summary)
      setConfirmVisible(true)
    } catch (e) {
      console.error('[analyzeFoodImage] error:', e)
      Alert.alert(t('home_image_analyze_error_title'), t('home_image_analyze_error_msg'))
    } finally {
      setAnalyzing(false)
      setAnalyzeStep('')
    }
  }

  const saveMeal = async (foods: FoodItem[], imageUri: string, summary: string) => {
    const total = foods.reduce(
      (acc, f) => ({
        calories: acc.calories + (f.nutrition?.calories ?? 0),
        carbs:    acc.carbs    + (f.nutrition?.carbs    ?? 0),
        protein:  acc.protein  + (f.nutrition?.protein  ?? 0),
        fat:      acc.fat      + (f.nutrition?.fat      ?? 0),
      }),
      { calories: 0, carbs: 0, protein: 0, fat: 0 }
    )

    let publicImageUrl: string | undefined
    if (imageUri && session?.user.id) {
      try {
        const ext = imageUri.split('.').pop() ?? 'jpg'
        const path = `${session.user.id}/${randomUUID()}.${ext}`
        const response = await fetch(imageUri)
        const blob = await response.blob()
        const { error: uploadError } = await supabase.storage
          .from('meal-images')
          .upload(path, blob, { contentType: getMimeType(imageUri) })
        if (!uploadError) {
          const { data } = supabase.storage.from('meal-images').getPublicUrl(path)
          publicImageUrl = data.publicUrl
        } else {
          console.error('[saveMeal] upload error:', uploadError)
        }
      } catch (e) {
        console.error('[saveMeal] image upload failed:', e)
      }
    }

    const log: MealLog = {
      id: randomUUID(),
      user_id: session?.user.id ?? '',
      date: today,
      meal_type: currentPeriod,
      foods,
      total_nutrition: total,
      image_url: publicImageUrl,
      created_at: new Date().toISOString(),
    }
    addMealLog(log)
    LayoutAnimation.configureNext({
      duration: 400,
      create: { type: 'easeInEaseOut', property: 'scaleXY' },
      update: { type: 'spring', springDamping: 0.75 },
    })
    if (currentPeriod === 'snack') {
      // 간식은 store에 누적되므로 로컬 state 즉시 리셋 → 중복 표시 방지
      setMealPhoto(null)
      setMealSummary(null)
    } else {
      setMealPhoto(imageUri)
      setMealSummary(summary)
    }
    setConfirmVisible(false)

    // Case 2: 식사 후 알림
    getNotificationStatus().then((status) => {
      if (status !== 'granted') return
      const otherTotal = todayMeals.reduce((s, m) => s + m.total_nutrition.calories, 0)
      const remainingCalories = calorieGoal - otherTotal - total.calories
      schedulePostMealCoaching({
        mealType: currentPeriod,
        foodNames: foods.map((f) => f.name),
        mealCalories: total.calories,
        remainingCalories,
      }).catch(() => {})
      if (remainingCalories < -200) {
        sendOvereatNudge(Math.abs(remainingCalories)).catch(() => {})
      } else if (remainingCalories >= 150) {
        sendUndereatingEncouragement({ mealType: currentPeriod, remainingCalories }).catch(() => {})
      }
      // streak 격려: 식단 기록 완료 시 현재 streak 확인
      const newStreak = calcStreak([...allLogs, log], calorieGoal)
      sendStreakEncouragement(newStreak).catch(() => {})
    })
  }

  const handleConfirm = () => {
    void saveMeal(pendingFoods, pendingImageUri, pendingSummary)
  }

  const handleReanalyze = async (editedText: string, setStep: (s: string) => void) => {
    try {
      setStep(t('home_analyze_step1'))
      const foods = await analyzeFoodText(editedText)
      setStep(t('home_analyze_step2'))
      await new Promise((r) => setTimeout(r, 200))
      setStep(t('home_analyze_step3'))
      await new Promise((r) => setTimeout(r, 150))
      const summary = buildSummary(foods)
      setPendingFoods(foods)
      setPendingSummary(summary)
    } catch (e) {
      console.error('[reanalyze] error:', e)
      Alert.alert(t('home_reanalyze_error_title'), t('home_reanalyze_error_msg'))
    }
  }

  // ── Checklist ─────────────────────────────────────────────────────────────

  const CHECKLIST = [
    {
      id: 'meal', icon: '📸', label: t('home_diet_section') + ' ' + t(periodMeta.labelKey),
      sublabel: t('home_meal_checklist_sub', consumed.calories, calorieGoal),
      maxPoints: 60, earnedPoints: mealScore,
      progress: Math.min(consumed.calories / calorieGoal, 1),
      done: mealScore >= 48, onToggle: undefined,
    },
    {
      id: 'exercise', icon: '🏃', label: t('home_exercise_section'),
      sublabel: t('home_ex_checklist_sub', todayBurned, exerciseGoalKcal),
      maxPoints: 40, earnedPoints: exScore,
      progress: Math.min(todayBurned / exerciseGoalKcal, 1),
      done: exScore >= 32, onToggle: undefined,
    },
  ]

  // ── Meal Card ──────────────────────────────────────────────────────────────

  const MealCard = (
    <View style={styles.card}>
      <View style={styles.mealHeaderRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.sectionTitle}>
            {t('home_diet_section')} <Text style={styles.sectionTitleAccent}>{t(periodMeta.labelKey)}</Text>
          </Text>
          <Text style={styles.sectionSub}>
            {periodMeta.emoji} {t('home_add_diet')}
          </Text>
        </View>

        {/* Photo zone */}
        {(() => {
          const snackLogs = currentPeriod === 'snack' ? todayMeals.filter((m) => m.meal_type === 'snack') : []
          const storedLog = currentPeriod === 'snack'
            ? snackLogs[snackLogs.length - 1]
            : todayMeals.find((m) => m.meal_type === currentPeriod)
          const displayPhoto = mealPhoto || storedLog?.image_url || null
          return (
            <TouchableOpacity
              style={styles.photoZone}
              onPress={() => setPickerVisible(true)}
              activeOpacity={0.8}
              disabled={analyzing || isProgramEnded}
            >
              {analyzing ? (
                <Text style={{ fontSize: 11, color: colors.mint, textAlign: 'center', paddingHorizontal: 4 }}>{analyzeStep}</Text>
              ) : displayPhoto ? (
                <Image source={{ uri: displayPhoto }} style={styles.photoThumb} />
              ) : (
                <View style={styles.photoPlus}>
                  <Text style={styles.photoPlusIcon}>+</Text>
                </View>
              )}
            </TouchableOpacity>
          )
        })()}
      </View>

      {/* Saved photo + summary — store 기준으로 표시 */}
      {(() => {
        if (currentPeriod === 'snack') {
          const snackLogs = todayMeals.filter((m) => m.meal_type === 'snack')
          if (snackLogs.length === 0) return null
          return (
            <>
              {snackLogs.map((log, i) => (
                <View key={i} style={styles.mealSummaryRow}>
                  {log.image_url && <Image source={{ uri: log.image_url }} style={styles.mealSummaryThumb} />}
                  <Text style={styles.mealSummaryText}>{buildSummary(log.foods)}</Text>
                </View>
              ))}
            </>
          )
        }
        const storedLog = todayMeals.find((m) => m.meal_type === currentPeriod)
        const displayPhoto = mealPhoto || storedLog?.image_url || null
        const displaySummary = mealSummary || (storedLog ? buildSummary(storedLog.foods) : null)
        if (!displaySummary) return null
        return (
          <View style={styles.mealSummaryRow}>
            {displayPhoto && <Image source={{ uri: displayPhoto }} style={styles.mealSummaryThumb} />}
            <Text style={styles.mealSummaryText}>{displaySummary}</Text>
          </View>
        )
      })()}

      {/* Calorie + macro */}
      <View style={styles.mealKcalRow}>
        <Text style={styles.mealMicro}>TODAY'S INTAKE</Text>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 2 }}>
          <FlipNumber value={consumed.calories} style={styles.mealKcal} />
          <Text style={styles.mealKcalGoal}> / {calorieGoal} kcal</Text>
        </View>
      </View>
      <MacroBar carbs={consumed.carbs} protein={consumed.protein} fat={consumed.fat} />
      <View style={styles.macroLegend}>
        {[
          { label: t('home_macro_carb'),    val: consumed.carbs,   goal: macroGoals?.carbs   ?? 200, color: colors.macroCarb },
          { label: t('home_macro_protein'), val: consumed.protein, goal: macroGoals?.protein ?? 130, color: colors.macroProtein },
          { label: t('home_macro_fat'),     val: consumed.fat,     goal: macroGoals?.fat     ?? 50,  color: colors.macroFat },
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
  )

  // ── Prescription Done Card ────────────────────────────────────────────────

  const fmt = (sec: number) => {
    const m = Math.floor(sec / 60); const s = sec % 60
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

  const routeCoords = completedLog?.route ?? []
  const hasRoute = routeCoords.length > 1

  const routeRegion = hasRoute ? (() => {
    const lats = routeCoords.map((c) => c.latitude)
    const lngs = routeCoords.map((c) => c.longitude)
    const minLat = Math.min(...lats), maxLat = Math.max(...lats)
    const minLng = Math.min(...lngs), maxLng = Math.max(...lngs)
    const pad = 0.001
    return {
      latitude:      (minLat + maxLat) / 2,
      longitude:     (minLng + maxLng) / 2,
      latitudeDelta:  Math.max(maxLat - minLat, 0.004) + pad,
      longitudeDelta: Math.max(maxLng - minLng, 0.004) + pad,
    }
  })() : null

  const PrescDoneCard = completedLog ? (
    <View style={[styles.card, styles.prescDoneCard, { padding: 0 }]}>

      {/* GPS 지도 — outdoor만, 카드 최상단 full-width */}
      {hasRoute && routeRegion && (
        <View style={styles.prescDoneMapWrap}>
          <MapView
            provider={PROVIDER_DEFAULT}
            style={styles.prescDoneMap}
            region={routeRegion}
            scrollEnabled={false}
            zoomEnabled={false}
            rotateEnabled={false}
            pitchEnabled={false}
            showsCompass={false}
            showsScale={false}
            showsUserLocation={false}
            pointerEvents="none"
          >
            <Polyline
              coordinates={routeCoords}
              strokeColor={colors.success}
              strokeWidth={4}
              lineCap="round"
              lineJoin="round"
            />
            <Marker coordinate={routeCoords[0]} anchor={{ x: 0.5, y: 0.5 }}>
              <View style={styles.prescDoneRouteStart} />
            </Marker>
            <Marker coordinate={routeCoords[routeCoords.length - 1]} anchor={{ x: 0.5, y: 0.5 }}>
              <View style={styles.prescDoneRouteEnd} />
            </Marker>
          </MapView>
        </View>
      )}

      {/* Header: 라벨 + 운동명 + 체크 서클 */}
      <View style={styles.prescDoneTop}>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={styles.prescDoneMicro}>{t('home_presc_done_micro')}</Text>
          <Text style={styles.prescDoneName}>{completedLog.exercise.name}</Text>
        </View>
        <View style={styles.prescDoneCheck}>
          <Text style={styles.prescDoneCheckMark}>✓</Text>
        </View>
      </View>

      {/* 구분선 */}
      <View style={styles.prescDoneSep} />

      {/* Stats — 크고 명확하게 */}
      <View style={styles.prescDoneStats}>
        <View style={styles.prescDoneStatCol}>
          <Text style={styles.prescDoneStatVal}>{completedLog.duration_minutes ?? 0}</Text>
          <Text style={styles.prescDoneStatLbl}>{t('home_unit_min')}</Text>
        </View>
        <View style={styles.prescDoneDiv} />
        <View style={styles.prescDoneStatCol}>
          <Text style={styles.prescDoneStatVal}>
            {completedLog.calories_burned ?? activeEx.kcal}
          </Text>
          <Text style={styles.prescDoneStatLbl}>kcal</Text>
        </View>
        {completedLog.distance_km != null && (
          <>
            <View style={styles.prescDoneDiv} />
            <View style={styles.prescDoneStatCol}>
              <Text style={styles.prescDoneStatVal}>
                {kmToDisplay(completedLog.distance_km, unitSystem).toFixed(2)}
              </Text>
              <Text style={styles.prescDoneStatLbl}>{distanceUnit(unitSystem)}</Text>
            </View>
          </>
        )}
      </View>

    </View>
  ) : null

  // ── Prescription Card ──────────────────────────────────────────────────────

  const PrescCard = (
    <View style={[styles.card, { padding: 0 }]}>
      <View style={styles.prescTop}>
        <Text style={styles.prescSparkle}>✦</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.prescMicro}>{t('home_presc_micro')}</Text>
          <Text style={styles.prescSummary}>
            {isKorean() ? activeEx.name : activeEx.en} {activeExAdjusted.minutes}{t('home_unit_min')}
            {activeExAdjusted.distanceKm != null ? ` · ${kmToDisplay(activeExAdjusted.distanceKm, unitSystem)}${distanceUnit(unitSystem)}` : ''}
          </Text>
          <DifficultyBadge level={activeEx.difficulty} />
        </View>
      </View>

      <View style={[styles.prescExRow, styles.prescExRowBorder]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.prescExName}>{isKorean() ? activeEx.name : activeEx.en}</Text>
        </View>
        <View style={styles.prescExRight}>
          <View style={{ alignItems: 'flex-end' }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 2 }}>
              <Text style={styles.prescExMin}>{activeEx.minutes}</Text>
              <Text style={styles.prescExUnit}>{t('home_unit_min')}</Text>
              {diffMinutes !== 0 && (
                <Text style={{ color: diffMinutes > 0 ? '#FF3B30' : '#34C759', fontSize: 12, marginLeft: 2 }}>
                  {diffMinutes > 0 ? `+${diffMinutes}` : `${diffMinutes}`}{t('home_unit_min')}
                </Text>
              )}
            </View>
            {activeEx.distanceKm != null
              ? <Text style={styles.prescExKcal}>
                  {kmToDisplay(activeEx.distanceKm, unitSystem)}{distanceUnit(unitSystem)}
                  {diffKm != null && diffKm !== 0 && (
                    <Text style={{ color: diffKm > 0 ? '#FF3B30' : '#34C759' }}>
                      {diffKm > 0 ? ` +${kmToDisplay(diffKm, unitSystem)}` : ` ${kmToDisplay(diffKm, unitSystem)}`}{distanceUnit(unitSystem)}
                    </Text>
                  )}
                  {' · '}{activeExAdjusted.kcal} kcal
                </Text>
              : <Text style={styles.prescExKcal}>{activeExAdjusted.kcal} kcal</Text>
            }
          </View>
        </View>
      </View>

      <View style={styles.prescBottom}>
        <Text style={styles.prescKcal}>{t('home_presc_est_kcal', activeExAdjusted.kcal)}</Text>
        <TouchableOpacity
          style={styles.prescCTA}
          activeOpacity={0.8}
          disabled={isProgramEnded}
          onPress={() => {
            router.push({
              pathname: '/exercise-tracker',
              params: {
                name: activeEx.name,
                nameEn: activeEx.en,
                type: activeEx.id,
                plannedAmount: String(
                  EXERCISE_CATEGORY[activeEx.id] === 'outdoor' && activeEx.distanceKm != null
                    ? activeEx.distanceKm
                    : activeEx.minutes
                ),
                plannedUnit: EXERCISE_CATEGORY[activeEx.id] === 'outdoor' ? 'km' : '분',
                plannedKcal: String(activeEx.kcal),
                category: EXERCISE_CATEGORY[activeEx.id] ?? 'indoor',
              },
            })
          }}
        >
          <Text style={styles.prescCTAText}>{t('home_presc_start')}</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.prescMoreBtn} onPress={toggleExpand} activeOpacity={0.7} disabled={isProgramEnded}>
        <Text style={styles.prescMoreText}>{prescExpanded ? t('home_presc_collapse') : t('home_presc_expand')}</Text>
      </TouchableOpacity>

      {prescExpanded && EXERCISE_OPTIONS.filter((_, i) => i !== selectedExercise).map((ex) => (
        <TouchableOpacity
          key={ex.id}
          style={[styles.prescExRow, styles.altExRow]}
          disabled={isProgramEnded}
          onPress={() => {
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
            setSelectedExercise(EXERCISE_OPTIONS.indexOf(ex))
            setPrescExpanded(false)
          }}
          activeOpacity={0.8}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.prescExName}>{isKorean() ? ex.name : ex.en}</Text>
            <Text style={styles.prescExEn}>{t('home_presc_tap_select')}</Text>
          </View>
          <View style={styles.prescExRight}>
            <View style={{ alignItems: 'flex-end' }}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 2 }}>
                <Text style={styles.prescExMin}>{ex.minutes}</Text>
                <Text style={styles.prescExUnit}>{t('home_unit_min')}</Text>
              </View>
              {ex.distanceKm != null
                ? <Text style={styles.prescExKcal}>{kmToDisplay(ex.distanceKm, unitSystem)}{distanceUnit(unitSystem)} · {ex.kcal} kcal</Text>
                : <Text style={styles.prescExKcal}>{ex.kcal} kcal</Text>
              }
            </View>
          </View>
        </TouchableOpacity>
      ))}

    </View>
  )

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {isProgramEnded && <View style={styles.endedOverlay} pointerEvents="none" />}
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Greeting ── */}
        <Animated.View style={[styles.greeting, stagger[0]]}>
          <View style={styles.greetRow}>
            <Text style={styles.greetText}>
              {t('home_greeting', userName)}
            </Text>
            <View style={styles.greetDDay}>
              <Text style={styles.greetDDayNum}>D-{daysLeft}</Text>
              <Text style={styles.greetDDaySub}>{t('home_dday_end', endDate)}</Text>
            </View>
          </View>
        </Animated.View>

        {/* ── Streak ── */}
        <Animated.View style={[styles.streakWrap, stagger[1]]}>
          {streak > 0 ? (
            <View style={styles.streakBadge}>
              <Text style={styles.streakFire}>🔥</Text>
              <Text style={styles.streakText}>
                <Text style={styles.streakNum}>{streak}{t('home_day_unit')}</Text> {t('home_streak_suffix')}
              </Text>
            </View>
          ) : (
            <View style={styles.streakBadge}>
              <Text style={styles.streakFire}>🌱</Text>
              <Text style={styles.streakText}>{t('home_streak_start')}</Text>
            </View>
          )}
        </Animated.View>

        {/* ── Score Card ── */}
        <Animated.View style={stagger[2]}>
          <View style={styles.card}>
            <View style={styles.mainTop}>
              {!coachLoading && (
                <SvgXml
                  xml={[APPLE_1, APPLE_2, APPLE_3, APPLE_4, APPLE_5][appleStage]}
                  width={110}
                  height={Math.round(110 * (197 / 150))}
                />
              )}
              <View style={styles.dDayBlock}>
                <View style={styles.infoCol}>
                  <Text style={styles.weightLabel}>{t('home_score_label')}</Text>
                  <Text style={[styles.scoreNum, { color: scoreColor(totalScore) }]}>
                    {totalScore}<Text style={styles.scoreUnit}>pt</Text>
                  </Text>
                  <Text style={styles.weightTarget}>{t('home_score_max')}</Text>
                </View>
                <View style={styles.infoCol}>
                  <Text style={styles.weightLabel}>{t('home_progress_label')}</Text>
                  <Text style={styles.weightDiff}>
                    {Math.round(((targetDays - daysLeft + 1) / targetDays) * 100)}
                    <Text style={styles.weightUnit}>%</Text>
                  </Text>
                  <Text style={styles.weightTarget}>{t('home_progress_sub', targetDays - daysLeft + 1, targetDays)}</Text>
                </View>
              </View>
            </View>
            <View style={styles.sectionDivider} />
            <View style={styles.checklist}>
              {CHECKLIST.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={styles.checkRow}
                  onPress={item.onToggle}
                  activeOpacity={item.onToggle ? 0.7 : 1}
                  disabled={!item.onToggle}
                >
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
                    <Text style={[styles.pointsText, item.done && styles.pointsTextDone]}>+{item.earnedPoints}{t('home_unit_pts')}</Text>
                    <Text style={styles.pointsMax}>/{item.maxPoints}</Text>
                  </View>
                </TouchableOpacity>
              ))}
              {todaySteps > 0 && (
                <View style={styles.checkRow}>
                  <View style={styles.checkIcon}>
                    <Text style={styles.checkIconText}>👟</Text>
                  </View>
                  <View style={styles.checkBody}>
                    <Text style={styles.checkLabel}>{t('home_steps_check_label')}</Text>
                    <Text style={styles.checkSub}>{t('home_steps_check_sub', todaySteps, stepsToKcal(todaySteps, weightKg))}</Text>
                  </View>
                </View>
              )}
            </View>
          </View>
        </Animated.View>

        {/* ── Cards: prescription rises when current period meal is saved ── */}
        <Animated.View
          style={stagger[3]}
          onLayout={(e) => {
            if (hasSavedCurrentMeal) prescCardY.current = e.nativeEvent.layout.y
          }}
        >
          {hasSavedCurrentMeal ? (completedLog ? PrescDoneCard : PrescCard) : MealCard}
        </Animated.View>

        <Animated.View
          style={stagger[4]}
          onLayout={(e) => {
            if (!hasSavedCurrentMeal) prescCardY.current = e.nativeEvent.layout.y
          }}
        >
          {hasSavedCurrentMeal ? MealCard : (completedLog ? PrescDoneCard : PrescCard)}
        </Animated.View>

        <View style={{ height: 32 }} />
      </ScrollView>

      <ImagePickerSheet
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        onPickBase64={handlePickedImage}
        onTextInput={() => setTextModalVisible(true)}
      />

      <TextInputModal
        visible={textModalVisible}
        onClose={() => setTextModalVisible(false)}
        onResult={(foods) => {
          const summary = buildSummary(foods)
          setPendingFoods(foods)
          setPendingImageUri('')
          setPendingSummary(summary)
          setConfirmVisible(true)
        }}
      />

      <ConfirmSheet
        visible={confirmVisible}
        imageUri={pendingImageUri}
        summary={pendingSummary}
        onConfirm={handleConfirm}
        onReanalyze={handleReanalyze}
        onClose={() => setConfirmVisible(false)}
      />

      <YesterdayReportModal
        visible={showYesterdayReport}
        onDismiss={dismissYesterdayReport}
        meals={yesterdayMeals}
        exercises={yesterdayExercises}
      />
    </View>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  endedOverlay: { ...StyleSheet.absoluteFillObject, zIndex: 99 },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 110 },

  greeting: { marginBottom: 8 },
  streakWrap: { marginBottom: 16 },
  streakBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', backgroundColor: '#FFF4E5', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  streakFire: { fontSize: 14 },
  streakText: { fontSize: 13, fontWeight: '500', color: '#B25000' },
  streakNum: { fontWeight: '800', color: '#E05C00' },
  greetRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  greetText: { fontSize: 15, fontWeight: '500', color: colors.textSecondary },
  greetName: { fontWeight: '600', color: colors.textPrimary },
  greetDDay: { alignItems: 'flex-end', marginTop: 10 },
  greetDDayNum: { fontSize: 28, fontWeight: '800', color: colors.textPrimary, letterSpacing: -1, lineHeight: 32 },
  greetDDaySub: { fontSize: 13, fontWeight: '600', color: colors.textPrimary, marginTop: 2 },

  card: {
    backgroundColor: colors.surface, borderRadius: 20, padding: 20, marginBottom: 12,
    shadowColor: '#101828', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 2, elevation: 2,
  },

  // Score card
  mainTop:   { flexDirection: 'row', gap: 20, alignItems: 'stretch' },
  dDayBlock: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  infoCol:   { flex: 1, gap: 2 },
  colDivider:  { width: 1, alignSelf: 'stretch', backgroundColor: colors.borderSoft, marginHorizontal: 12 },
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

  // Meal card
  mealHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 16 },
  sectionTitle:       { fontSize: 17, fontWeight: '600', color: colors.textPrimary, letterSpacing: -0.3, marginBottom: 3 },
  sectionTitleAccent: { color: colors.mint },
  sectionSub:    { fontSize: 12, color: colors.textTertiary },
  photoZone: {
    width: 76, height: 76, borderRadius: 14,
    backgroundColor: colors.background,
    borderWidth: 1.5, borderColor: colors.borderSoft, borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0, overflow: 'hidden',
  },
  photoThumb:    { width: 76, height: 76, borderRadius: 14 },
  photoPlus: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  photoPlusIcon: { fontSize: 20, color: colors.textSecondary, lineHeight: 24 },

  mealSummaryRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.background, borderRadius: 12, padding: 12, marginBottom: 14,
  },
  mealSummaryThumb: { width: 44, height: 44, borderRadius: 8, resizeMode: 'cover' },
  mealSummaryText: { flex: 1, fontSize: 13, color: colors.textSecondary, lineHeight: 18 },

  mealKcalRow:  { marginBottom: 10 },
  mealMicro:    { fontSize: 11, fontWeight: '600', color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  mealKcal:     { fontSize: 28, fontWeight: '700', color: colors.textPrimary, letterSpacing: -0.6 },
  mealKcalGoal: { fontSize: 14, fontWeight: '400', color: colors.textTertiary },
  macroLegend:  { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
  macroItem:    { flexDirection: 'row', alignItems: 'center', gap: 5 },
  macroDot:     { width: 8, height: 8, borderRadius: 4 },
  macroLbl:     { fontSize: 12, color: colors.textSecondary },
  macroVal:     { fontSize: 12, fontWeight: '600', color: colors.textPrimary },
  macroGoalText:{ fontWeight: '400', color: colors.textTertiary, fontSize: 12 },

  // Prescription Done Card
  prescDoneCard:   { borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  prescDoneMapWrap:{ height: 180, overflow: 'hidden' },
  prescDoneMap:    { flex: 1 },
  prescDoneRouteStart: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.textSecondary, borderWidth: 2, borderColor: '#fff' },
  prescDoneRouteEnd:   { width: 14, height: 14, borderRadius: 7, backgroundColor: colors.success, borderWidth: 2.5, borderColor: '#fff' },
  prescDoneTop: {
    flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 20, paddingVertical: 18,
  },
  prescDoneMicro:  { fontSize: 12, fontWeight: '500', color: colors.textTertiary, letterSpacing: 0.1 },
  prescDoneName:   { fontSize: 22, fontWeight: '700', color: colors.textPrimary, letterSpacing: -0.5 },
  prescDoneCheck:  {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.success,
    alignItems: 'center', justifyContent: 'center',
  },
  prescDoneCheckMark: { fontSize: 18, color: '#fff', fontWeight: '700' },
  prescDoneSep:    { height: 1, backgroundColor: colors.borderSoft, marginHorizontal: 20 },
  prescDoneStats:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 20 },
  prescDoneStatCol:{ flex: 1, alignItems: 'center', gap: 6 },
  prescDoneStatVal:{ fontSize: 28, fontWeight: '700', color: colors.textPrimary, letterSpacing: -0.8 },
  prescDoneStatLbl:{ fontSize: 12, color: colors.textTertiary, fontWeight: '400' },
  prescDoneDiv:    { width: 1, height: 40, backgroundColor: colors.borderSoft },

  // Prescription
  prescTop: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    padding: 20, borderBottomWidth: 1, borderBottomColor: colors.borderSoft,
  },
  prescSparkle:  { fontSize: 18, marginTop: 1 },
  prescMoreBtn: { alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.borderSoft },
  prescMoreText: { fontSize: 12, fontWeight: '600', color: colors.textTertiary, letterSpacing: 0.3 },
  prescMicro:   { fontSize: 11, fontWeight: '600', color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  prescSummary: { fontSize: 17, fontWeight: '700', color: colors.textPrimary, letterSpacing: -0.3 },

  prescExRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingHorizontal: 20, paddingVertical: 14,
  },
  prescExRowBorder: { borderTopWidth: 1, borderTopColor: colors.borderSoft },
  prescExName:      { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
  prescExEn:        { fontSize: 12, color: colors.textTertiary, marginTop: 2 },
  prescExRight:     { flexDirection: 'row', alignItems: 'baseline', gap: 2 },
  prescExMin:       { fontSize: 22, fontWeight: '700', color: colors.textPrimary, letterSpacing: -0.4 },
  prescExUnit:      { fontSize: 13, color: colors.textSecondary },
  prescExKcal:      { fontSize: 11, color: colors.textTertiary, marginTop: 2 },

  expandBtn:     { width: '100%', alignItems: 'center', paddingVertical: 12 },
  expandBtnText: { fontSize: 13, fontWeight: '500', color: colors.textTertiary },

  prescBottom: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 14,
    borderTopWidth: 1, borderTopColor: colors.borderSoft,
  },
  prescKcal:  { fontSize: 13, color: colors.textSecondary },
  altExRow:   { backgroundColor: colors.background, opacity: 0.75 },
  prescCTA: {
    backgroundColor: colors.textPrimary, borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 7,
  },
  prescCTAText: { fontSize: 12, fontWeight: '600', color: '#fff' },
})

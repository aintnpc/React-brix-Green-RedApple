import { useState, useRef, useEffect } from 'react'
import { randomUUID } from 'expo-crypto'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Modal, TextInput, ActivityIndicator, Image, Animated,
  KeyboardAvoidingView, Platform, Alert,
} from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors } from '@repo/theme'
import { getTodayString } from '@repo/shared'
import type { FoodItem, MealLog, NutritionInfo } from '@repo/shared'
import { useAuthStore } from '../../store/auth'
import { useDietStore } from '../../store/diet'
import { useCoachStore } from '../../store/coach'
import { schedulePostMealCoaching, sendOvereatNudge, getNotificationStatus } from '../../lib/notifications'
import { analyzeFoodText, analyzeFoodImage, generateMealFeedback } from '../../lib/ai'
import { t, ta } from '../../lib/i18n'

type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack'
type EatState = 'good' | 'over' | 'under'

const MEAL_CONFIGS = [
  { type: 'breakfast' as MealType, labelKey: 'diet_breakfast' as const, emoji: '🌅', ratio: 0.25 },
  { type: 'lunch'     as MealType, labelKey: 'diet_lunch'     as const, emoji: '☀️', ratio: 0.35 },
  { type: 'dinner'    as MealType, labelKey: 'diet_dinner'    as const, emoji: '🌙', ratio: 0.30 },
  { type: 'snack'     as MealType, labelKey: 'diet_snack'     as const, emoji: '🍎', ratio: 0.10 },
]

const TRAINER_KEYS: Record<EatState, string[]> = {
  good:  ['diet_trainer_good1', 'diet_trainer_good2', 'diet_trainer_good3', 'diet_trainer_good4'],
  over:  ['diet_trainer_over1', 'diet_trainer_over2', 'diet_trainer_over3', 'diet_trainer_over4'],
  under: ['diet_trainer_under1', 'diet_trainer_under2', 'diet_trainer_under3', 'diet_trainer_under4'],
}

const STATE_EMOJI: Record<EatState, string> = { good: '😊', over: '😤', under: '😶' }
const STATE_COLOR: Record<EatState, string> = { good: '#34C759', over: '#FF3B30', under: colors.textTertiary }

// ─── FlipNumber ───────────────────────────────────────────────────────────────

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
  return <Animated.Text style={[style, { transform: [{ translateY }], opacity }]}>{value}</Animated.Text>
}

// ─── MacroBar ─────────────────────────────────────────────────────────────────

function MacroBar({ carbs, protein, fat }: { carbs: number; protein: number; fat: number }) {
  const total = carbs + protein + fat || 1
  return (
    <View style={mbar.bar}>
      <View style={[mbar.seg, { flex: carbs / total, backgroundColor: colors.macroCarb }]} />
      <View style={[mbar.seg, { flex: protein / total, backgroundColor: colors.macroProtein }]} />
      <View style={[mbar.seg, { flex: fat / total, backgroundColor: colors.macroFat }]} />
    </View>
  )
}
const mbar = StyleSheet.create({
  bar: { flexDirection: 'row', height: 6, borderRadius: 3, overflow: 'hidden', backgroundColor: colors.borderSoft },
  seg: { height: 6 },
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sumNutrition(foods: FoodItem[]): NutritionInfo {
  return foods.reduce(
    (acc, f) => ({
      calories: acc.calories + f.nutrition.calories,
      carbs:    acc.carbs    + f.nutrition.carbs,
      protein:  acc.protein  + f.nutrition.protein,
      fat:      acc.fat      + f.nutrition.fat,
    }),
    { calories: 0, carbs: 0, protein: 0, fat: 0 }
  )
}

function getMimeType(uri: string): 'image/jpeg' | 'image/png' | 'image/webp' {
  if (uri.endsWith('.png')) return 'image/png'
  if (uri.endsWith('.webp')) return 'image/webp'
  return 'image/jpeg'
}

function buildSummary(foods: FoodItem[]): string {
  const names = foods.map((f) => `${f.name} ${f.amount}`).join(', ')
  const total = foods.reduce((s, f) => s + f.nutrition.calories, 0)
  return `${names} (${t('diet_summary_kcal', total)})`
}

function eatState(calories: number, target: number): EatState {
  if (calories === 0) return 'good'
  const r = calories / Math.max(target, 1)
  if (r < 0.7) return 'under'
  if (r > 1.0) return 'over'
  return 'good'
}

function trainerComment(state: EatState, mealType: MealType, calories: number): string {
  if (calories === 0) return t('diet_first_meal')
  const pool = TRAINER_KEYS[state]
  const idx  = MEAL_CONFIGS.findIndex((m) => m.type === mealType)
  return t(pool[idx % pool.length] as any)
}

// ─── Logged Card ──────────────────────────────────────────────────────────────

function LoggedCard({ config, log, target, onLongPress }: {
  config: (typeof MEAL_CONFIGS)[0]
  log: MealLog
  target: number
  onLongPress?: () => void
}) {
  const kcal     = log.total_nutrition.calories
  const state    = eatState(kcal, target)
  const comment  = log.ai_comment ?? null
  const foodText = log.foods.map((f) => `${f.name} ${f.amount}`).join(' · ')
  const scale    = useRef(new Animated.Value(1)).current

  const onPressIn = () => {
    Animated.spring(scale, { toValue: 0.965, useNativeDriver: true, damping: 18, stiffness: 300 }).start()
  }
  const onPressOut = () => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, damping: 18, stiffness: 300 }).start()
  }

  return (
    <Animated.View style={{ transform: [{ scale }], marginBottom: 12 }}>
      <TouchableOpacity
        style={[cs.card, { marginBottom: 0 }]}
        onLongPress={onLongPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        delayLongPress={380}
        activeOpacity={1}
      >
        <View style={cs.cardTop}>
          <Text style={cs.cardEmoji}>{config.emoji}</Text>
          <Text style={cs.cardMeal}>{t(config.labelKey)}</Text>
          <View style={[cs.statePill, { backgroundColor: STATE_COLOR[state] + '18' }]}>
            <Text style={[cs.statePillText, { color: STATE_COLOR[state] }]}>{t(state === 'good' ? 'diet_state_good' : state === 'over' ? 'diet_state_over' : 'diet_state_under')}</Text>
          </View>
          <Text style={cs.cardKcal}>{kcal} kcal</Text>
        </View>

        <View style={cs.loggedBody}>
          {log.image_url && (
            <Image source={{ uri: log.image_url }} style={cs.foodImage} />
          )}
          <View style={cs.foodRow}>
            <Text style={cs.faceEmoji}>{STATE_EMOJI[state]}</Text>
            <Text style={cs.foodText} numberOfLines={2}>{foodText}</Text>
          </View>
          {comment && (
            <View style={cs.commentSection}>
              <Text style={cs.commentIcon}>💬</Text>
              <Text style={cs.commentText}>{comment}</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    </Animated.View>
  )
}

// ─── Empty Card ───────────────────────────────────────────────────────────────

function EmptyCard({ config, onAdd, isAnalyzing }: {
  config: (typeof MEAL_CONFIGS)[0]
  onAdd: () => void
  isAnalyzing: boolean
}) {
  return (
    <View style={cs.card}>
      <View style={cs.cardTop}>
        <Text style={cs.cardEmoji}>{config.emoji}</Text>
        <Text style={cs.cardMeal}>{t(config.labelKey)}</Text>
        <Text style={cs.questionMark}>-</Text>
      </View>

      <TouchableOpacity style={cs.addZone} onPress={onAdd} activeOpacity={0.8} disabled={isAnalyzing}>
        {isAnalyzing ? (
          <ActivityIndicator color={colors.textPrimary} />
        ) : (
          <View style={cs.addCircle}>
            <Text style={cs.addPlus}>+</Text>
          </View>
        )}
      </TouchableOpacity>
    </View>
  )
}

// ─── Input Options Sheet ──────────────────────────────────────────────────────

function InputOptionsSheet({ visible, onClose, onCamera, onGallery, onText }: {
  visible: boolean
  onClose: () => void
  onCamera: () => void
  onGallery: () => void
  onText: () => void
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

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={handleClose}>
      <Animated.View style={[ss.overlay, { opacity: overlayOpacity }]}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={handleClose} />
        <Animated.View style={[ss.sheet, { transform: [{ translateY }] }]}>
          <View style={ss.handle} />
          <TouchableOpacity style={ss.option} onPress={onCamera} activeOpacity={0.7}>
            <Text style={ss.optIcon}>📷</Text>
            <View>
              <Text style={ss.optLabel}>{t('diet_camera')}</Text>
              <Text style={ss.optSub}>{t('diet_camera_sub')}</Text>
            </View>
          </TouchableOpacity>
          <View style={ss.divider} />
          <TouchableOpacity style={ss.option} onPress={onGallery} activeOpacity={0.7}>
            <Text style={ss.optIcon}>🖼️</Text>
            <View>
              <Text style={ss.optLabel}>{t('diet_gallery')}</Text>
              <Text style={ss.optSub}>{t('diet_gallery_sub')}</Text>
            </View>
          </TouchableOpacity>
          <View style={ss.divider} />
          <TouchableOpacity style={ss.option} onPress={onText} activeOpacity={0.7}>
            <Text style={ss.optIcon}>✏️</Text>
            <View>
              <Text style={ss.optLabel}>{t('diet_text_input')}</Text>
              <Text style={ss.optSub}>{t('diet_text_input_sub')}</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity style={ss.cancel} onPress={handleClose} activeOpacity={0.7}>
            <Text style={ss.cancelText}>{t('diet_cancel')}</Text>
          </TouchableOpacity>
        </Animated.View>
      </Animated.View>
    </Modal>
  )
}

const ss = StyleSheet.create({
  overlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet:      { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingBottom: 36, paddingTop: 12 },
  handle:     { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.borderSoft, alignSelf: 'center', marginBottom: 20 },
  option:     { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 16 },
  optIcon:    { fontSize: 26 },
  optLabel:   { fontSize: 16, fontWeight: '600', color: colors.textPrimary },
  optSub:     { fontSize: 13, color: colors.textTertiary, marginTop: 2 },
  divider:    { height: 1, backgroundColor: colors.borderSoft },
  cancel:     { marginTop: 12, paddingVertical: 14, alignItems: 'center', backgroundColor: colors.background, borderRadius: 14 },
  cancelText: { fontSize: 16, fontWeight: '600', color: colors.textSecondary },
})

// ─── Text Input Modal ─────────────────────────────────────────────────────────

function TextInputModal({ visible, onClose, mealType, onResult }: {
  visible: boolean
  onClose: () => void
  mealType: MealType | null
  onResult: (mealType: MealType, foods: FoodItem[], inputText: string) => void
}) {
  const [text, setText]           = useState('')
  const [analyzing, setAnalyzing] = useState(false)
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
    ]).start(() => onClose())
  }

  const handleAnalyze = async () => {
    if (!text.trim() || !mealType) return
    setAnalyzing(true); setError(null)
    try {
      const inputText = text.trim()
      const foods = await analyzeFoodText(inputText)
      setText('')
      Animated.parallel([
        Animated.timing(overlayOpacity, { toValue: 0, duration: 180, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 500, duration: 220, useNativeDriver: true }),
      ]).start(() => { onClose(); onResult(mealType, foods, inputText) })
    } catch (e) {
      console.error('[TextInputModal] error:', e)
      setError(t('diet_analyze_error'))
    } finally {
      setAnalyzing(false)
    }
  }

  return (
    <Modal visible={visible} animationType="none" transparent onRequestClose={handleClose}>
      <Animated.View style={[tm.overlay, { opacity: overlayOpacity }]}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={handleClose} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <Animated.View style={[tm.sheet, { transform: [{ translateY }] }]}>
            <View style={tm.handle} />
            <Text style={tm.title}>{t('diet_what_did_you_eat')}</Text>
            <Text style={tm.sub}>{t('diet_text_example')}</Text>
            <TextInput
              style={tm.input}
              value={text}
              onChangeText={setText}
              placeholder={t('diet_text_placeholder')}
              placeholderTextColor={colors.textTertiary}
              multiline
              numberOfLines={4}
              editable={!analyzing}
            />
            {error && <Text style={tm.error}>{error}</Text>}
            {analyzing ? (
              <View style={tm.loadingRow}>
                <ActivityIndicator color={colors.textPrimary} />
                <Text style={tm.loadingText}>{t('diet_analyzing')}</Text>
              </View>
            ) : (
              <TouchableOpacity
                style={[tm.btn, !text.trim() && tm.btnDisabled]}
                onPress={handleAnalyze}
                disabled={!text.trim()}
                activeOpacity={0.85}
              >
                <Text style={tm.btnText}>{t('diet_analyze_btn')}</Text>
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

function ConfirmSheet({ visible, imageUri, summary, onConfirm, onEditSave, onClose }: {
  visible: boolean
  imageUri: string
  summary: string
  onConfirm: () => void
  onEditSave: (edited: string) => Promise<void>
  onClose: () => void
}) {
  const translateY     = useRef(new Animated.Value(500)).current
  const overlayOpacity = useRef(new Animated.Value(0)).current
  const [editing, setEditing]     = useState(false)
  const [saving, setSaving]       = useState(false)
  const [editText, setEditText]   = useState(summary)

  useEffect(() => {
    setEditText(summary)
    setEditing(false)
    setSaving(false)
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
      <Animated.View style={[cf.overlay, { opacity: overlayOpacity }]}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={handleClose} />
        <Animated.View style={[cf.sheet, { transform: [{ translateY }] }]}>
          <View style={cf.handle} />

          {!!imageUri
            ? <Image source={{ uri: imageUri }} style={cf.previewImg} resizeMode="cover" />
            : (
              <View style={cf.previewPlaceholder}>
                <Text style={cf.previewPlaceholderEmoji}>📝</Text>
                <Text style={cf.previewPlaceholderText}>{t('diet_text_analysis')}</Text>
              </View>
            )
          }

          <View style={cf.summaryBox}>
            {editing ? (
              <TextInput
                style={cf.editInput}
                value={editText}
                onChangeText={setEditText}
                multiline
                autoFocus
                returnKeyType="done"
              />
            ) : (
              <Text style={cf.summaryText}>{summary}</Text>
            )}
          </View>

          <Text style={cf.question}>{t('diet_ai_result_correct')}</Text>

          <View style={cf.btnRow}>
            {editing ? (
              <TouchableOpacity
                style={[cf.btn, cf.btnPrimary, saving && { opacity: 0.5 }]}
                disabled={saving}
                onPress={async () => {
                  setSaving(true)
                  try {
                    await onEditSave(editText)
                  } catch {
                    setSaving(false)
                    setEditing(false)
                    Alert.alert(t('diet_reanalyze_fail'), t('diet_reanalyze_fail_msg'))
                  }
                }}
                activeOpacity={0.85}
              >
                {saving
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={cf.btnTextPrimary}>{t('diet_save_btn')}</Text>
                }
              </TouchableOpacity>
            ) : (
              <>
                <TouchableOpacity
                  style={[cf.btn, cf.btnSecondary]}
                  onPress={() => setEditing(true)}
                  activeOpacity={0.8}
                >
                  <Text style={cf.btnTextSecondary}>{t('diet_no_btn')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[cf.btn, cf.btnPrimary]}
                  onPress={onConfirm}
                  activeOpacity={0.85}
                >
                  <Text style={cf.btnTextPrimary}>{t('diet_yes_btn')}</Text>
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

const cf = StyleSheet.create({
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
  previewPlaceholder: {
    width: '100%', height: 100, borderRadius: 16, backgroundColor: colors.background,
    alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  previewPlaceholderEmoji: { fontSize: 32 },
  previewPlaceholderText: { fontSize: 13, color: colors.textTertiary, fontWeight: '500' },
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

// ─── Diet Screen ──────────────────────────────────────────────────────────────

export default function DietScreen() {
  const insets       = useSafeAreaInsets()
  const { session, macroGoals, bodyInfo, isProgramEnded } = useAuthStore()
  const { addMealLog, removeMealLog, updateMealLog, getTodayLogs } = useDietStore()
  const { goals } = useCoachStore()

  const today      = getTodayString()
  const todayMeals = getTodayLogs(today)
  const dailyTarget = goals?.calorieGoal ?? macroGoals?.calories ?? 2000

  const { programStartedAt } = useAuthStore()
  const targetDays = bodyInfo?.target_days ?? 14
  const daysLeft = (() => {
    if (!programStartedAt) return targetDays
    const startDate = new Date(programStartedAt).toLocaleDateString('en-CA')
    const todayStr  = new Date().toLocaleDateString('en-CA')
    const elapsed   = Math.floor((new Date(todayStr).getTime() - new Date(startDate).getTime()) / 86_400_000)
    return Math.max(0, targetDays - elapsed)
  })()

  const [analyzing, setAnalyzing]           = useState<MealType | null>(null)
  const [inputSheetMeal, setInputSheetMeal] = useState<MealType | null>(null)
  const [textModalMeal, setTextModalMeal]   = useState<MealType | null>(null)

  // Confirm sheet state
  const [confirmVisible, setConfirmVisible]       = useState(false)
  const [confirmMealType, setConfirmMealType]     = useState<MealType | null>(null)
  const [confirmFoods, setConfirmFoods]           = useState<FoodItem[]>([])
  const [confirmImageUri, setConfirmImageUri]     = useState('')
  const [confirmInputText, setConfirmInputText]   = useState<string | undefined>(undefined)
  const [confirmSummary, setConfirmSummary]       = useState('')
  const [confirmEditingId, setConfirmEditingId]   = useState<string | null>(null)

  const consumed = todayMeals.reduce(
    (acc: { calories: number; carbs: number; protein: number; fat: number }, m: MealLog) => ({
      calories: acc.calories + m.total_nutrition.calories,
      carbs:    acc.carbs    + m.total_nutrition.carbs,
      protein:  acc.protein  + m.total_nutrition.protein,
      fat:      acc.fat      + m.total_nutrition.fat,
    }),
    { calories: 0, carbs: 0, protein: 0, fat: 0 }
  )
  const overallEmoji = STATE_EMOJI[eatState(consumed.calories, dailyTarget)]

  const now       = new Date()
  const dateStr   = t('diet_date_format', now.getMonth() + 1, now.getDate(), now.getDay())

  const openConfirm = (meal: MealType, foods: FoodItem[], imageUri: string, editingId: string | null, inputText?: string) => {
    setConfirmFoods(foods)
    setConfirmImageUri(imageUri)
    setConfirmInputText(inputText)
    setConfirmSummary(buildSummary(foods))
    setConfirmMealType(meal)
    setConfirmEditingId(editingId)
    setConfirmVisible(true)
  }

  const handleCamera = async () => {
    const meal = inputSheetMeal; if (!meal) return
    setInputSheetMeal(null)
    await new Promise((r) => setTimeout(r, 250))
    setAnalyzing(meal)
    const { status } = await ImagePicker.requestCameraPermissionsAsync()
    if (status === 'granted') {
      const picked = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.3, base64: true })
      if (!picked.canceled && picked.assets[0]) {
        try {
          const foods = await analyzeFoodImage(picked.assets[0].base64!, getMimeType(picked.assets[0].uri))
          openConfirm(meal, foods, picked.assets[0].uri, null)
        } catch (e) {
          console.error('[handleCamera] Gemini error:', e)
        }
      }
    }
    setAnalyzing(null)
  }

  const handleGallery = async () => {
    const meal = inputSheetMeal; if (!meal) return
    setInputSheetMeal(null)
    await new Promise((r) => setTimeout(r, 250))
    setAnalyzing(meal)
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status === 'granted') {
      const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.3, base64: true })
      if (!picked.canceled && picked.assets[0]) {
        try {
          const foods = await analyzeFoodImage(picked.assets[0].base64!, getMimeType(picked.assets[0].uri))
          openConfirm(meal, foods, picked.assets[0].uri, null)
        } catch (e) {
          console.error('[handleGallery] Gemini error:', e)
        }
      }
    }
    setAnalyzing(null)
  }

  const handleText = () => {
    setTextModalMeal(inputSheetMeal)
    setInputSheetMeal(null)
  }

  const handleTextResult = (mealType: MealType, foods: FoodItem[], inputText: string) => {
    openConfirm(mealType, foods, '', null, inputText)
  }

  const handleConfirmSave = async () => {
    if (!confirmMealType) return
    if (!session?.user.id) return
    if (confirmEditingId) removeMealLog(confirmEditingId)
    const nutrition = sumNutrition(confirmFoods)
    const log: MealLog = {
      id: randomUUID(),
      user_id: session.user.id,
      date: today,
      meal_type: confirmMealType,
      foods: confirmFoods,
      total_nutrition: nutrition,
      image_url: confirmImageUri || undefined,
      input_text: confirmInputText,
      created_at: new Date().toISOString(),
    }
    try {
      await addMealLog(log)
    } catch {
      Alert.alert(t('diet_save_fail_title'), t('diet_save_fail_msg'))
      return
    }
    setConfirmVisible(false)

    // AI 피드백 백그라운드 생성
    generateMealFeedback(confirmFoods, confirmMealType, nutrition.calories)
      .then((comment) => { if (comment) updateMealLog(log.id, { ai_comment: comment }) })
      .catch((e) => console.warn('[MealFeedback] failed:', e))

    // Case 2: 식사 후 다음 끼니 코칭 알림 스케줄
    getNotificationStatus().then((status) => {
      if (status !== 'granted') return
      const otherMealsTotal = todayMeals
        .filter((m: MealLog) => m.id !== confirmEditingId && m.meal_type !== confirmMealType)
        .reduce((s: number, m: MealLog) => s + m.total_nutrition.calories, 0)
      const remainingCalories = (macroGoals?.calories ?? 2000) - otherMealsTotal - nutrition.calories
      schedulePostMealCoaching({
        mealType: confirmMealType,
        foodNames: confirmFoods.map((f: FoodItem) => f.name),
        mealCalories: nutrition.calories,
        remainingCalories,
      }).catch(() => {})
      if (remainingCalories < -200) {
        sendOvereatNudge(Math.abs(remainingCalories)).catch(() => {})
      }
    })
  }

  const handleConfirmEdit = async (edited: string): Promise<void> => {
    const foods = await analyzeFoodText(edited)
    if (!confirmMealType) return
    if (!session?.user.id) return
    if (confirmEditingId) removeMealLog(confirmEditingId)
    const nutrition = sumNutrition(foods)
    const log: MealLog = {
      id: randomUUID(),
      user_id: session.user.id,
      date: today,
      meal_type: confirmMealType,
      foods,
      total_nutrition: nutrition,
      image_url: confirmImageUri || undefined,
      input_text: edited,
      created_at: new Date().toISOString(),
    }
    try {
      await addMealLog(log)
    } catch {
      Alert.alert(t('diet_save_fail_title'), t('diet_save_fail_msg'))
      return
    }
    setConfirmVisible(false)

    generateMealFeedback(foods, confirmMealType, nutrition.calories)
      .then((comment) => { if (comment) updateMealLog(log.id, { ai_comment: comment }) })
      .catch((e) => console.warn('[MealFeedback] failed:', e))
  }

  const handleLongPressLog = (log: MealLog) => {
    const isInStore = todayMeals.some((m) => m.id === log.id)
    openConfirm(
      log.meal_type as MealType,
      log.foods,
      log.image_url ?? '',
      isInStore ? log.id : null,
      log.input_text,
    )
  }

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      {isProgramEnded && <View style={s.endedOverlay} pointerEvents="none" />}
      {/* Header */}
      <View style={s.header}>
        <Text style={s.dateText}>{dateStr}</Text>
        <Text style={s.dDayText}>D-{daysLeft}</Text>
      </View>

      {/* Stacked meal cards */}
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Today's Intake */}
        <View style={s.intakeCard}>
          <View style={s.intakeHeader}>
            <View>
              <Text style={s.intakeMicro}>TODAY'S INTAKE</Text>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 2 }}>
                <FlipNumber value={consumed.calories} style={s.intakeKcal} />
                <Text style={s.intakeGoal}> / {dailyTarget} kcal</Text>
              </View>
            </View>
            <Text style={s.intakeEmoji}>{overallEmoji}</Text>
          </View>
          <MacroBar carbs={consumed.carbs} protein={consumed.protein} fat={consumed.fat} />
          <View style={s.macroLegend}>
            {[
              { label: t('diet_carbs'),   val: consumed.carbs,   goal: macroGoals?.carbs   ?? 200, color: colors.macroCarb },
              { label: t('diet_protein'), val: consumed.protein, goal: macroGoals?.protein ?? 130, color: colors.macroProtein },
              { label: t('diet_fat'),     val: consumed.fat,     goal: macroGoals?.fat     ?? 50,  color: colors.macroFat },
            ].map((m) => (
              <View key={m.label} style={s.macroItem}>
                <View style={[s.macroDot, { backgroundColor: m.color }]} />
                <Text style={s.macroLbl}>{m.label}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 1 }}>
                  <FlipNumber value={m.val} style={s.macroVal} />
                  <Text style={s.macroGoalTxt}>/{m.goal}g</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        {MEAL_CONFIGS.map((config) => {
          const isAnalyzing = analyzing === config.type
          const target      = dailyTarget * config.ratio

          if (config.type === 'snack') {
            const snackLogs = todayMeals.filter((m) => m.meal_type === 'snack')
            return (
              <View key="snack">
                {snackLogs.length === 0 ? (
                  <EmptyCard
                    config={config}
                    onAdd={() => setInputSheetMeal('snack')}
                    isAnalyzing={isAnalyzing || isProgramEnded}
                  />
                ) : (
                  <>
                    {snackLogs.map((log) => (
                      <LoggedCard
                        key={log.id}
                        config={config}
                        log={log}
                        target={target}
                        onLongPress={isProgramEnded ? undefined : () => handleLongPressLog(log)}
                      />
                    ))}
                    <TouchableOpacity
                      style={cs.snackAddBtn}
                      onPress={() => setInputSheetMeal('snack')}
                      activeOpacity={0.7}
                      disabled={isAnalyzing || isProgramEnded}
                    >
                      {isAnalyzing
                        ? <ActivityIndicator size="small" color={colors.textTertiary} />
                        : <Text style={cs.snackAddBtnText}>{t('diet_snack_add')}</Text>
                      }
                    </TouchableOpacity>
                  </>
                )}
              </View>
            )
          }

          const log = todayMeals.find((m) => m.meal_type === config.type)
          if (log) {
            return (
              <LoggedCard
                key={config.type}
                config={config}
                log={log}
                target={target}
                onLongPress={isProgramEnded ? undefined : () => handleLongPressLog(log)}
              />
            )
          }
          return (
            <EmptyCard
              key={config.type}
              config={config}
              onAdd={() => setInputSheetMeal(config.type)}
              isAnalyzing={isAnalyzing || isProgramEnded}
            />
          )
        })}

        <View style={{ height: 24 }} />
      </ScrollView>

      <InputOptionsSheet
        visible={inputSheetMeal !== null}
        onClose={() => setInputSheetMeal(null)}
        onCamera={handleCamera}
        onGallery={handleGallery}
        onText={handleText}
      />
      <TextInputModal
        visible={textModalMeal !== null}
        onClose={() => setTextModalMeal(null)}
        mealType={textModalMeal}
        onResult={handleTextResult}
      />
      <ConfirmSheet
        visible={confirmVisible}
        imageUri={confirmImageUri}
        summary={confirmSummary}
        onConfirm={handleConfirmSave}
        onEditSave={handleConfirmEdit}
        onClose={() => setConfirmVisible(false)}
      />
    </View>
  )
}

// ─── Screen Styles ────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root:    { flex: 1, backgroundColor: colors.background },
  endedOverlay: { ...StyleSheet.absoluteFillObject, zIndex: 99 },
  header:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 14 },
  dateText:{ fontSize: 16, fontWeight: '700', color: colors.textPrimary, letterSpacing: -0.3 },
  dDayText:{ fontSize: 22, fontWeight: '800', color: colors.textPrimary, letterSpacing: -0.8 },
  scroll:  { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 110 },

  intakeCard: {
    backgroundColor: colors.surface, borderRadius: 20, padding: 20, marginBottom: 12,
    shadowColor: '#101828', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 2, elevation: 2,
  },
  intakeHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  intakeMicro:   { fontSize: 11, fontWeight: '600', color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  intakeKcal:    { fontSize: 28, fontWeight: '700', color: colors.textPrimary, letterSpacing: -0.6 },
  intakeGoal:    { fontSize: 14, fontWeight: '400', color: colors.textTertiary },
  intakeEmoji:   { fontSize: 40 },
  macroLegend:   { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
  macroItem:     { flexDirection: 'row', alignItems: 'center', gap: 5 },
  macroDot:      { width: 8, height: 8, borderRadius: 4 },
  macroLbl:      { fontSize: 12, color: colors.textSecondary },
  macroVal:      { fontSize: 12, fontWeight: '600', color: colors.textPrimary },
  macroGoalTxt:  { fontSize: 12, fontWeight: '400', color: colors.textTertiary },
})

// ─── Card Styles ──────────────────────────────────────────────────────────────

const cs = StyleSheet.create({
  card: {
    backgroundColor: colors.surface, borderRadius: 20, marginBottom: 12, overflow: 'hidden',
    shadowColor: '#101828', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 6, elevation: 3,
  },

  cardTop: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 13,
    borderBottomWidth: 1, borderBottomColor: colors.borderSoft,
  },
  cardEmoji:   { fontSize: 18 },
  cardMeal:    { fontSize: 15, fontWeight: '700', color: colors.textPrimary, flex: 1, letterSpacing: -0.2 },
  cardKcal:    { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  questionMark:{ fontSize: 15, color: colors.textTertiary },
  editHint:    { fontSize: 10, color: colors.textTertiary, fontWeight: '500' },

  statePill:     { borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 },
  statePillText: { fontSize: 11, fontWeight: '700' },

  // Logged card body
  loggedBody: { padding: 14, gap: 10 },
  foodRow:    { flexDirection: 'row', alignItems: 'center', gap: 10 },
  faceEmoji:  { fontSize: 28 },
  foodText:   { flex: 1, fontSize: 14, fontWeight: '500', color: colors.textPrimary, lineHeight: 20 },
  foodImage:  { width: '100%', height: 120, borderRadius: 12, resizeMode: 'cover' },

  commentSection: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: colors.background, borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  commentIcon: { fontSize: 13, marginTop: 1 },
  commentText: { flex: 1, fontSize: 12, fontWeight: '500', color: colors.textSecondary, lineHeight: 18, fontStyle: 'italic' },

  // Empty card
  addZone: {
    height: 80, alignItems: 'center', justifyContent: 'center',
    margin: 14, borderRadius: 14,
    backgroundColor: colors.background,
    borderWidth: 1.5, borderColor: colors.borderSoft, borderStyle: 'dashed',
  },
  addCircle: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  addPlus: { fontSize: 22, color: colors.textSecondary, lineHeight: 26 },
  snackAddBtn: {
    marginBottom: 12, paddingVertical: 12, borderRadius: 14,
    borderWidth: 1.5, borderColor: colors.borderSoft, borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.background,
  },
  snackAddBtnText: { fontSize: 14, fontWeight: '600', color: colors.textTertiary },
})

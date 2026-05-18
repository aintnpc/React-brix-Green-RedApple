import { useState, useRef, useEffect } from 'react'
import { randomUUID } from 'expo-crypto'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Modal, TextInput, ActivityIndicator, Image, Animated,
  KeyboardAvoidingView, Platform, Alert,
} from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colorsDark as colors } from '@repo/theme'
import { getTodayString, calculateBuildGoals } from '@repo/shared'
import type { FoodItem, MealLog, NutritionInfo, BuildBodyInfo } from '@repo/shared'
import { useAuthStore } from '../../store/auth'
import { useDietStore } from '../../store/diet'
import { schedulePostMealCoaching, sendOvereatNudge, getNotificationStatus } from '../../lib/notifications'
import { analyzeFoodText, analyzeFoodImage, generateMealFeedback } from '../../lib/claude'
import type { MealFeedbackContext } from '../../lib/claude'

type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack'
type EatState = 'good' | 'over' | 'under'

const MEAL_CONFIGS = [
  { type: 'breakfast' as MealType, label: '아침',  emoji: '🌅', ratio: 0.25 },
  { type: 'lunch'     as MealType, label: '점심',  emoji: '☀️', ratio: 0.35 },
  { type: 'dinner'    as MealType, label: '저녁',  emoji: '🌙', ratio: 0.30 },
  { type: 'snack'     as MealType, label: '간식',  emoji: '🍎', ratio: 0.10 },
]

const TRAINER: Record<EatState, string[]> = {
  good: [
    '단백질 완벽해요! 근성장 환경 만들어지고 있어요 💪',
    '이 페이스면 12주 후 몸이 달라져 있을 거예요!',
    '탄단지 밸런스 좋아요. 오늘 운동까지 하면 금상첨화!',
    '근육이 좋아하는 식단이에요. 꾸준히 가요!',
  ],
  over: [
    '단백질이 좀 많네요. 다음 끼는 탄수화물 위주로요 😅',
    '괜찮아요! 운동 강도 올리면 충분히 활용돼요 💪',
    '클린벌크 중이면 약간 오버는 근성장에 도움 돼요.',
    '벌크 기간엔 조금 많은 것보다 부족한 게 더 나빠요!',
  ],
  under: [
    '단백질 부족이에요! 근손실 올 수 있어요 🍗',
    '운동만큼 단백질이 중요해요. 닭가슴살이라도요!',
    '목표 단백질의 80%는 채워야 근성장이 가능해요.',
    '고강도 운동 후 단백질 부족은 근육이 분해돼요!',
  ],
}

const STATE_EMOJI: Record<EatState, string> = { good: '😊', over: '😤', under: '😶' }
const STATE_LABEL: Record<EatState, string> = { good: '단백질 OK', over: '단백질 과다', under: '단백질 부족' }
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
      <View style={[mbar.seg, { flex: protein / total, backgroundColor: colors.macroProtein }]} />
      <View style={[mbar.seg, { flex: carbs / total, backgroundColor: colors.macroCarb }]} />
      <View style={[mbar.seg, { flex: fat / total, backgroundColor: colors.macroFat }]} />
    </View>
  )
}
const mbar = StyleSheet.create({
  bar: { flexDirection: 'row', height: 6, borderRadius: 3, overflow: 'hidden', backgroundColor: colors.borderSoft },
  seg: { height: 6 },
})

// ─── ProteinProgressBar ───────────────────────────────────────────────────────

function ProteinProgressBar({ consumed, target }: { consumed: number; target: number }) {
  const ratio = Math.min(consumed / Math.max(target, 1), 1)
  const anim  = useRef(new Animated.Value(0)).current
  useEffect(() => {
    Animated.timing(anim, { toValue: ratio, duration: 500, useNativeDriver: false }).start()
  }, [ratio])
  const pct = Math.round(ratio * 100)
  const barColor = ratio >= 1 ? '#34C759' : ratio >= 0.7 ? colors.macroProtein : '#FF9F0A'
  return (
    <View style={pb.wrap}>
      <View style={pb.track}>
        <Animated.View
          style={[pb.fill, { width: anim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }), backgroundColor: barColor }]}
        />
      </View>
      <Text style={[pb.pct, { color: barColor }]}>{pct}%</Text>
    </View>
  )
}
const pb = StyleSheet.create({
  wrap:  { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  track: { flex: 1, height: 8, borderRadius: 4, backgroundColor: colors.borderSoft, overflow: 'hidden' },
  fill:  { height: 8, borderRadius: 4 },
  pct:   { fontSize: 13, fontWeight: '700', minWidth: 36, textAlign: 'right' },
})

// ─── DailySummaryBanner ───────────────────────────────────────────────────────

function DailySummaryBanner({
  protein, proteinTarget,
  calories, calorieTarget,
  fat, fatTarget,
}: {
  protein: number; proteinTarget: number
  calories: number; calorieTarget: number
  fat: number; fatTarget: number
}) {
  const proteinPct  = Math.round((protein / Math.max(proteinTarget, 1)) * 100)
  const calDiff     = calories - calorieTarget
  const fatOver     = fat > fatTarget * 1.2

  let proteinMsg: string
  let proteinColor: string
  if (proteinPct >= 100) {
    proteinMsg   = `단백질 목표 달성! 💪 (${protein}g)`
    proteinColor = '#34C759'
  } else if (proteinPct >= 70) {
    proteinMsg   = `단백질 ${protein}g — 목표의 ${proteinPct}%. 조금만 더!`
    proteinColor = colors.macroProtein
  } else {
    proteinMsg   = `단백질 ${protein}g — 목표의 ${proteinPct}%. 근손실 주의 🍗`
    proteinColor = '#FF9F0A'
  }

  const subs: string[] = []
  if (calDiff > 200)        subs.push(`칼로리 ${calDiff}kcal 초과`)
  else if (calDiff < -300)  subs.push(`칼로리 ${Math.abs(calDiff)}kcal 부족`)
  else                      subs.push('칼로리 적정')
  if (fatOver)              subs.push(`지방 ${fat}g — 과다`)

  return (
    <View style={db.wrap}>
      <Text style={db.label}>오늘의 총평</Text>
      <Text style={[db.protein, { color: proteinColor }]}>{proteinMsg}</Text>
      <Text style={db.sub}>{subs.join('  ·  ')}</Text>
    </View>
  )
}
const db = StyleSheet.create({
  wrap:    { backgroundColor: colors.surface, borderRadius: 16, padding: 16, marginBottom: 12, gap: 6 },
  label:   { fontSize: 11, fontWeight: '600', color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5 },
  protein: { fontSize: 15, fontWeight: '700', letterSpacing: -0.2 },
  sub:     { fontSize: 12, color: colors.textTertiary, fontWeight: '500' },
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
  return `${names} (약 ${total} kcal)`
}

function eatState(protein: number, proteinTarget: number): EatState {
  if (protein === 0) return 'good'
  const r = protein / Math.max(proteinTarget, 1)
  if (r < 0.7) return 'under'
  if (r > 1.3) return 'over'
  return 'good'
}

function trainerComment(state: EatState, mealType: MealType, protein: number): string {
  if (protein === 0) return '첫 식사를 기록해봐요! 단백질부터 채워가요 🍗'
  const pool = TRAINER[state]
  const idx  = MEAL_CONFIGS.findIndex((m) => m.type === mealType)
  return pool[idx % pool.length]
}

// ─── Logged Card ──────────────────────────────────────────────────────────────

function LoggedCard({ config, log, proteinTarget, onLongPress }: {
  config: typeof MEAL_CONFIGS[0]
  log: MealLog
  proteinTarget: number
  onLongPress?: () => void
}) {
  const kcal     = log.total_nutrition.calories
  const protein  = log.total_nutrition.protein
  const state    = eatState(protein, proteinTarget * config.ratio)
  const comment  = log.ai_comment ?? trainerComment(state, config.type, protein)
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
          <Text style={cs.cardMeal}>{config.label}</Text>
          <View style={[cs.statePill, { backgroundColor: STATE_COLOR[state] + '18' }]}>
            <Text style={[cs.statePillText, { color: STATE_COLOR[state] }]}>{STATE_LABEL[state]}</Text>
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
          <View style={cs.commentSection}>
            <Text style={cs.commentIcon}>💬</Text>
            <Text style={cs.commentText}>{comment}</Text>
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  )
}

// ─── Empty Card ───────────────────────────────────────────────────────────────

function EmptyCard({ config, onAdd, isAnalyzing }: {
  config: typeof MEAL_CONFIGS[0]
  onAdd: () => void
  isAnalyzing: boolean
}) {
  return (
    <View style={cs.card}>
      <View style={cs.cardTop}>
        <Text style={cs.cardEmoji}>{config.emoji}</Text>
        <Text style={cs.cardMeal}>{config.label}</Text>
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
              <Text style={ss.optLabel}>사진 찍기</Text>
              <Text style={ss.optSub}>카메라로 바로 찍어요</Text>
            </View>
          </TouchableOpacity>
          <View style={ss.divider} />
          <TouchableOpacity style={ss.option} onPress={onGallery} activeOpacity={0.7}>
            <Text style={ss.optIcon}>🖼️</Text>
            <View>
              <Text style={ss.optLabel}>앨범에서 선택</Text>
              <Text style={ss.optSub}>갤러리에서 골라요</Text>
            </View>
          </TouchableOpacity>
          <View style={ss.divider} />
          <TouchableOpacity style={ss.option} onPress={onText} activeOpacity={0.7}>
            <Text style={ss.optIcon}>✏️</Text>
            <View>
              <Text style={ss.optLabel}>텍스트 입력</Text>
              <Text style={ss.optSub}>직접 입력해요</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity style={ss.cancel} onPress={handleClose} activeOpacity={0.7}>
            <Text style={ss.cancelText}>취소</Text>
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
  onResult: (mealType: MealType, foods: FoodItem[]) => void
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
      const foods = await analyzeFoodText(text.trim())
      setText('')
      Animated.parallel([
        Animated.timing(overlayOpacity, { toValue: 0, duration: 180, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 500, duration: 220, useNativeDriver: true }),
      ]).start(() => { onClose(); onResult(mealType, foods) })
    } catch (e) {
      console.error('[TextInputModal] error:', e)
      setError('분석 중 오류가 발생했어요. 다시 시도해주세요.')
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
            <Text style={tm.title}>무엇을 드셨나요?</Text>
            <Text style={tm.sub}>예: 맥도날드 빅맥 세트, 아메리카노</Text>
            <TextInput
              style={tm.input}
              value={text}
              onChangeText={setText}
              placeholder="자유롭게 입력하세요..."
              placeholderTextColor={colors.textTertiary}
              multiline
              numberOfLines={4}
              editable={!analyzing}
            />
            {error && <Text style={tm.error}>{error}</Text>}
            {analyzing ? (
              <View style={tm.loadingRow}>
                <ActivityIndicator color={colors.textPrimary} />
                <Text style={tm.loadingText}>AI가 분석 중이에요...</Text>
              </View>
            ) : (
              <TouchableOpacity
                style={[tm.btn, !text.trim() && tm.btnDisabled]}
                onPress={handleAnalyze}
                disabled={!text.trim()}
                activeOpacity={0.85}
              >
                <Text style={tm.btnText}>AI 분석하기</Text>
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
      <Animated.View style={[cf.overlay, { opacity: overlayOpacity }]}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={handleClose} />
        <Animated.View style={[cf.sheet, { transform: [{ translateY }] }]}>
          <View style={cf.handle} />

          {!!imageUri
            ? <Image source={{ uri: imageUri }} style={cf.previewImg} resizeMode="cover" />
            : (
              <View style={cf.previewPlaceholder}>
                <Text style={cf.previewPlaceholderEmoji}>📝</Text>
                <Text style={cf.previewPlaceholderText}>텍스트 입력 분석</Text>
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

          <Text style={cf.question}>AI 분석 결과가 맞나요?</Text>

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
                    Alert.alert('분석 실패', '재분석 중 오류가 발생했어요. 다시 시도해주세요.')
                  }
                }}
                activeOpacity={0.85}
              >
                {saving
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={cf.btnTextPrimary}>저장</Text>
                }
              </TouchableOpacity>
            ) : (
              <>
                <TouchableOpacity
                  style={[cf.btn, cf.btnSecondary]}
                  onPress={() => setEditing(true)}
                  activeOpacity={0.8}
                >
                  <Text style={cf.btnTextSecondary}>아니요, 수정할게요</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[cf.btn, cf.btnPrimary]}
                  onPress={onConfirm}
                  activeOpacity={0.85}
                >
                  <Text style={cf.btnTextPrimary}>맞아요 ✓</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </Animated.View>
      </Animated.View>
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
  const { session, bodyInfo, programStartedAt } = useAuthStore()
  const { addMealLog, removeMealLog, updateMealLog, getTodayLogs } = useDietStore()

  const today      = getTodayString()
  const todayMeals = getTodayLogs(today)

  const buildInfo = bodyInfo as BuildBodyInfo | null
  const buildGoals = buildInfo
    ? calculateBuildGoals(buildInfo, programStartedAt ?? today)
    : null

  const proteinTarget  = buildGoals?.proteinGoal ?? 160
  const calorieTarget  = buildGoals?.calorieGoal ?? 2500
  const carbTarget     = buildGoals?.carbGoal    ?? 300
  const fatTarget      = buildGoals?.fatGoal     ?? 60
  const daysLeft       = buildGoals?.daysLeft    ?? 84
  const todayMuscles   = buildGoals?.todayMuscleGroups ?? []

  const [analyzing, setAnalyzing]           = useState<MealType | null>(null)
  const [inputSheetMeal, setInputSheetMeal] = useState<MealType | null>(null)
  const [textModalMeal, setTextModalMeal]   = useState<MealType | null>(null)

  // Confirm sheet state
  const [confirmVisible, setConfirmVisible]     = useState(false)
  const [confirmMealType, setConfirmMealType]   = useState<MealType | null>(null)
  const [confirmFoods, setConfirmFoods]         = useState<FoodItem[]>([])
  const [confirmImageUri, setConfirmImageUri]   = useState('')
  const [confirmSummary, setConfirmSummary]     = useState('')
  const [confirmEditingId, setConfirmEditingId] = useState<string | null>(null)

  const consumed = todayMeals.reduce(
    (acc: { calories: number; carbs: number; protein: number; fat: number }, m: MealLog) => ({
      calories: acc.calories + m.total_nutrition.calories,
      carbs:    acc.carbs    + m.total_nutrition.carbs,
      protein:  acc.protein  + m.total_nutrition.protein,
      fat:      acc.fat      + m.total_nutrition.fat,
    }),
    { calories: 0, carbs: 0, protein: 0, fat: 0 }
  )
  const overallEmoji = STATE_EMOJI[eatState(consumed.protein, proteinTarget)]

  const now       = new Date()
  const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토']
  const dateStr   = `${now.getMonth() + 1}월 ${now.getDate()}일 ${DAY_NAMES[now.getDay()]}요일`

  const openConfirm = (meal: MealType, foods: FoodItem[], imageUri: string, editingId: string | null) => {
    setConfirmFoods(foods)
    setConfirmImageUri(imageUri)
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

  const handleTextResult = (mealType: MealType, foods: FoodItem[]) => {
    openConfirm(mealType, foods, '', null)
  }

  const handleConfirmSave = () => {
    if (!confirmMealType) return
    if (confirmEditingId) removeMealLog(confirmEditingId)
    const nutrition = sumNutrition(confirmFoods)
    const log: MealLog = {
      id: randomUUID(),
      user_id: session?.user.id ?? 'anonymous',
      date: today,
      meal_type: confirmMealType,
      foods: confirmFoods,
      total_nutrition: nutrition,
      image_url: confirmImageUri || undefined,
      created_at: new Date().toISOString(),
    }
    addMealLog(log)
    setConfirmVisible(false)

    // AI 피드백 백그라운드 생성
    const feedbackCtx: MealFeedbackContext = {
      todayMuscles,
      proteinRatio: proteinTarget > 0 ? consumed.protein / proteinTarget : undefined,
      proteinGoal: proteinTarget,
      proteinConsumed: consumed.protein,
    }
    generateMealFeedback(confirmFoods, confirmMealType, nutrition.calories, feedbackCtx)
      .then((comment) => { if (comment) updateMealLog(log.id, { ai_comment: comment }) })
      .catch(() => {})

    // Case 2: 식사 후 다음 끼니 코칭 알림 스케줄
    getNotificationStatus().then((status) => {
      if (status !== 'granted') return
      const otherMealsTotal = todayMeals
        .filter((m: MealLog) => m.id !== confirmEditingId && m.meal_type !== confirmMealType)
        .reduce((s: number, m: MealLog) => s + m.total_nutrition.calories, 0)
      const remainingCalories = calorieTarget - otherMealsTotal - nutrition.calories
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
    if (confirmEditingId) removeMealLog(confirmEditingId)
    const nutrition = sumNutrition(foods)
    const log: MealLog = {
      id: randomUUID(),
      user_id: session?.user.id ?? 'anonymous',
      date: today,
      meal_type: confirmMealType,
      foods,
      total_nutrition: nutrition,
      image_url: confirmImageUri || undefined,
      created_at: new Date().toISOString(),
    }
    addMealLog(log)
    setConfirmVisible(false)

    const editFeedbackCtx: MealFeedbackContext = {
      todayMuscles,
      proteinRatio: proteinTarget > 0 ? consumed.protein / proteinTarget : undefined,
      proteinGoal: proteinTarget,
      proteinConsumed: consumed.protein,
    }
    generateMealFeedback(foods, confirmMealType, nutrition.calories, editFeedbackCtx)
      .then((comment) => { if (comment) updateMealLog(log.id, { ai_comment: comment }) })
      .catch(() => {})
  }

  const handleLongPressLog = (log: MealLog) => {
    const isInStore = todayMeals.some((m) => m.id === log.id)
    openConfirm(
      log.meal_type as MealType,
      log.foods,
      log.image_url ?? '',
      isInStore ? log.id : null,
    )
  }

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
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
              <Text style={s.intakeMicro}>TODAY'S PROTEIN</Text>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 2 }}>
                <FlipNumber value={consumed.protein} style={s.intakeKcal} />
                <Text style={s.intakeGoal}> / {proteinTarget}g</Text>
              </View>
              <Text style={s.intakeCalSub}>{consumed.calories} / {calorieTarget} kcal</Text>
            </View>
            <Text style={s.intakeEmoji}>{overallEmoji}</Text>
          </View>
          <ProteinProgressBar consumed={consumed.protein} target={proteinTarget} />
          <MacroBar carbs={consumed.carbs} protein={consumed.protein} fat={consumed.fat} />
          <View style={s.macroLegend}>
            {[
              { label: '단백질',   val: consumed.protein, goal: proteinTarget, color: colors.macroProtein },
              { label: '탄수화물', val: consumed.carbs,   goal: carbTarget,    color: colors.macroCarb },
              { label: '지방',     val: consumed.fat,     goal: fatTarget,     color: colors.macroFat },
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

          if (config.type === 'snack') {
            const snackLogs = todayMeals.filter((m) => m.meal_type === 'snack')
            return (
              <View key="snack">
                {snackLogs.length === 0 ? (
                  <EmptyCard
                    config={config}
                    onAdd={() => setInputSheetMeal('snack')}
                    isAnalyzing={isAnalyzing}
                  />
                ) : (
                  <>
                    {snackLogs.map((log) => (
                      <LoggedCard
                        key={log.id}
                        config={config}
                        log={log}
                        proteinTarget={proteinTarget}
                        onLongPress={() => handleLongPressLog(log)}
                      />
                    ))}
                    <TouchableOpacity
                      style={cs.snackAddBtn}
                      onPress={() => setInputSheetMeal('snack')}
                      activeOpacity={0.7}
                      disabled={isAnalyzing}
                    >
                      {isAnalyzing
                        ? <ActivityIndicator size="small" color={colors.textTertiary} />
                        : <Text style={cs.snackAddBtnText}>+ 간식 추가</Text>
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
                proteinTarget={proteinTarget}
                onLongPress={() => handleLongPressLog(log)}
              />
            )
          }
          return (
            <EmptyCard
              key={config.type}
              config={config}
              onAdd={() => setInputSheetMeal(config.type)}
              isAnalyzing={isAnalyzing}
            />
          )
        })}

        {todayMeals.length > 0 && (
          <DailySummaryBanner
            protein={consumed.protein}
            proteinTarget={proteinTarget}
            calories={consumed.calories}
            calorieTarget={calorieTarget}
            fat={consumed.fat}
            fatTarget={fatTarget}
          />
        )}

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
  intakeCalSub:  { fontSize: 12, color: colors.textTertiary, marginTop: 2 },
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

import { useState, useEffect, useRef, useCallback, useMemo, useLayoutEffect } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Image, Dimensions, Animated, Vibration, Platform,
  FlatList, Modal, TextInput,
} from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colorsDark as colors } from '@repo/theme'
import { prescribeRoutine, getDeloadStatus, getTodayString, suggestProgressiveOverload } from '@repo/shared'
import type { BuildBodyInfo, PrescribedExercise, RPE, MuscleGroup } from '@repo/shared'
import type { Exercise, ExerciseSet } from '@repo/shared'
import { useAuthStore } from '../../store/auth'
import { useExerciseLogStore } from '../../store/exerciseLog'
import { useDietStore } from '../../store/diet'
import { useExerciseStore } from '../../store/exercise'
import { supabase } from '../../lib/supabase'
import { useUIStore } from '../../store/ui'
import { MuscleHeatmap } from '../../components/muscle/MuscleHeatmap'
import exercisesRaw from '../../data/exercises.json'

const exercises = exercisesRaw as unknown as Exercise[]
const SW = Dimensions.get('window').width

// ─── Constants ────────────────────────────────────────────────────────────────

const MUSCLE_KO: Record<string, string> = {
  chest: '가슴', back: '등', shoulders: '어깨', biceps: '이두', triceps: '삼두',
  forearms: '전완', abs: '복근', obliques: '옆구리', glutes: '둔근',
  quads: '대퇴사두', hamstrings: '햄스트링', calves: '종아리',
  traps: '승모근', lats: '광배근', lower_back: '허리',
}

const EQUIPMENT_KO: Record<string, string> = {
  none: '맨몸', barbell: '바벨', dumbbell: '덤벨', machine: '머신',
  cable: '케이블', kettlebell: '케틀벨', resistance_band: '밴드',
}

const RPE_OPTIONS: { value: RPE; label: string; emoji: string; color: string; weightDelta: number }[] = [
  { value: 'easy',     label: '쉬움',  emoji: '😊', color: '#34C759', weightDelta: +2.5 },
  { value: 'moderate', label: '적당',  emoji: '😐', color: '#FF9F0A', weightDelta:  0   },
  { value: 'hard',     label: '힘듦',  emoji: '😤', color: '#FF6B35', weightDelta:  0   },
  { value: 'max',      label: '한계',  emoji: '💀', color: '#FF3B30', weightDelta: -2.5 },
]

// 휴식 시간 (초) — build_goal 기반
const REST_SECONDS: Record<string, number> = {
  bulk: 90, cut: 60, maintain: 75,
}

type Phase = 'first_guide' | 'briefing' | 'warmup' | 'session' | 'summary'
type SessionStep = 'active' | 'rpe' | 'rest' | 'next_exercise' | 'inter_warmup'

const COMPOUND_KEYWORDS = ['press', 'squat', 'deadlift', 'row', 'pull-up', 'pullup', 'chin-up', 'chinup', 'dip', 'lunge', 'clean', 'snatch', 'thruster']
function isCompoundEx(name: string) { return COMPOUND_KEYWORDS.some((k) => name.toLowerCase().includes(k)) }

interface WorkoutItem {
  prescribed: PrescribedExercise
  exercise: Exercise
  available: boolean  // 장비 있음/없음
}

interface CompletedSet {
  exerciseId: string
  setIndex: number
  weight_kg: number
  reps: number
  rpe: RPE
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(sec: number) {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function roundWeight(w: number) {
  return Math.round(w * 2) / 2  // 0.5kg 단위
}

// ─── Flash Overlay ────────────────────────────────────────────────────────────

function FlashOverlay({ visible }: { visible: boolean }) {
  const opacity = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (!visible) return
    Animated.sequence([
      Animated.timing(opacity, { toValue: 0.85, duration: 80, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0,    duration: 120, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0.85, duration: 80, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0,    duration: 120, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0.85, duration: 80, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0,    duration: 200, useNativeDriver: true }),
    ]).start()
    if (Platform.OS === 'ios') {
      Vibration.vibrate([0, 400, 100, 400])
    } else {
      Vibration.vibrate([400, 100, 400])
    }
  }, [visible])

  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { backgroundColor: '#fff', opacity, zIndex: 999 }]}
    />
  )
}

// ─── Phase 0: 첫 세션 가이드 ─────────────────────────────────────────────────

const FIRST_SESSION_STEPS = [
  {
    emoji: '👋',
    title: '처음이시군요!',
    desc: '아직 적정 중량을 몰라도 괜찮아요.\n앱이 오늘 첫 세션에서 자동으로 파악할게요.',
  },
  {
    emoji: '🪶',
    title: '처음엔 가볍게 시작해요',
    desc: '첫 세트는 아주 가벼운 무게로 시작해요.\n"쉬움"이 뜨면 무게를 올리고,\n"적당"이 되면 그 무게가 당신의 시작 중량이에요.',
  },
  {
    emoji: '📈',
    title: '매 세션 기록이 쌓여요',
    desc: '오늘 세션이 끝나면 앱이 다음 주 중량을\n자동으로 처방해요. 그냥 시키는 대로만 해요.',
  },
  {
    emoji: '💪',
    title: '준비됐나요?',
    desc: '오늘부터 12주 뒤 몸이 달라져 있을 거예요.\n지금 시작해봐요!',
  },
]

function FirstSessionGuide({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0)
  const current = FIRST_SESSION_STEPS[step]
  const isLast = step === FIRST_SESSION_STEPS.length - 1
  const fadeAnim = useRef(new Animated.Value(1)).current

  const goNext = () => {
    if (isLast) { onDone(); return }
    Animated.sequence([
      Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 150, useNativeDriver: true }),
    ]).start(() => setStep((s) => s + 1))
  }

  return (
    <View style={fg.root}>
      <Animated.View style={[fg.card, { opacity: fadeAnim }]}>
        <Text style={fg.emoji}>{current.emoji}</Text>
        <Text style={fg.title}>{current.title}</Text>
        <Text style={fg.desc}>{current.desc}</Text>
      </Animated.View>

      {/* 스텝 인디케이터 */}
      <View style={fg.dots}>
        {FIRST_SESSION_STEPS.map((_, i) => (
          <View key={i} style={[fg.dot, i === step && fg.dotActive]} />
        ))}
      </View>

      <TouchableOpacity style={fg.btn} onPress={goNext} activeOpacity={0.85}>
        <Text style={fg.btnTxt}>{isLast ? '운동 시작하기 →' : '다음'}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={fg.skipBtn} onPress={onDone} activeOpacity={0.7}>
        <Text style={fg.skipBtnTxt}>건너뛰기</Text>
      </TouchableOpacity>
    </View>
  )
}

const fg = StyleSheet.create({
  root:       { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  card:       { alignItems: 'center', gap: 16, marginBottom: 40 },
  emoji:      { fontSize: 72 },
  title:      { fontSize: 26, fontWeight: '800', color: colors.textPrimary, letterSpacing: -0.5, textAlign: 'center' },
  desc:       { fontSize: 15, color: colors.textSecondary, textAlign: 'center', lineHeight: 24 },
  dots:       { flexDirection: 'row', gap: 8, marginBottom: 32 },
  dot:        { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.borderSoft },
  dotActive:  { width: 20, backgroundColor: colors.mint },
  btn:        { width: '100%', backgroundColor: colors.mint, borderRadius: 16, paddingVertical: 18, alignItems: 'center', marginBottom: 12 },
  btnTxt:     { fontSize: 16, fontWeight: '700', color: '#fff' },
  skipBtn:    { paddingVertical: 12 },
  skipBtnTxt: { fontSize: 14, fontWeight: '600', color: colors.textTertiary },
})

// ─── Phase 1: 오늘의 처방 브리핑 ─────────────────────────────────────────────

function estimateDuration(items: WorkoutItem[], restSeconds: number): string {
  // 운동당 세트 × (평균 세트 시간 40초 + 휴식) + 운동 전환 30초
  const totalSets = items.reduce((sum, item) => sum + item.prescribed.sets, 0)
  const totalSec = totalSets * (40 + restSeconds) + items.length * 30
  const mins = Math.round(totalSec / 60)
  return `약 ${mins}분`
}

function BriefingPhase({
  items,
  isDeload,
  currentWeek,
  restSeconds,
  proteinLow,
  onStart,
  onReplace,
}: {
  items: WorkoutItem[]
  isDeload: boolean
  currentWeek: number
  restSeconds: number
  proteinLow: boolean
  onStart: () => void
  onReplace: (idx: number, muscle: MuscleGroup) => void
}) {
  const muscles = [...new Set(items.map((i) => i.prescribed.muscleGroup))]
  const totalSets = items.reduce((sum, i) => sum + i.prescribed.sets, 0)
  const duration = estimateDuration(items, restSeconds)

  // 처방 이유 메시지 (progression 기반) — 운동별로 하나씩
  const progressionMessages = items
    .map((item) => {
      const p = (item.prescribed as any).progression
      const name = item.exercise.name_ko
      if (p === 'weight_up') return `${name} — 지난번에 충분히 여유가 있었어요. 무게 올렸어요 💪`
      if (p === 'sets_up')   return `${name} — 세트 하나 추가했어요. 점점 강해지는 중!`
      if (p === 'weight_down') return `${name} — 지난번에 한계였으니 무게 살짝 내렸어요`
      return null
    })
    .filter(Boolean) as string[]

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={br.content}
      showsVerticalScrollIndicator={false}
    >
      {/* 딜로드 배너 */}
      {isDeload && (
        <View style={br.deloadBanner}>
          <Text style={br.deloadEmoji}>🔁</Text>
          <View style={{ flex: 1 }}>
            <Text style={br.deloadTitle}>{currentWeek}주차 — 딜로드 주</Text>
            <Text style={br.deloadSub}>볼륨을 절반으로 줄여 몸을 회복시켜요. 회복도 훈련이에요.</Text>
          </View>
        </View>
      )}

      {/* 단백질 부족 배너 */}
      {proteinLow && !isDeload && (
        <View style={br.proteinBanner}>
          <Text style={br.deloadEmoji}>🥩</Text>
          <View style={{ flex: 1 }}>
            <Text style={br.proteinBannerTitle}>단백질 부족 — 볼륨 조정됨</Text>
            <Text style={br.deloadSub}>최근 3일 단백질이 부족했어요. 볼륨을 약간 줄였어요. 오늘은 닭가슴살 챙겨요!</Text>
          </View>
        </View>
      )}

      <Text style={br.label}>오늘의 처방</Text>
      <Text style={br.title}>
        {muscles.map((m) => MUSCLE_KO[m] ?? m).join(' · ')}
      </Text>

      {/* 예상 시간 + 세트 수 뱃지 */}
      <View style={br.metaRow}>
        <View style={br.metaBadge}>
          <Text style={br.metaIcon}>⏱</Text>
          <Text style={br.metaTxt}>{duration}</Text>
        </View>
        <View style={br.metaBadge}>
          <Text style={br.metaIcon}>🏋️</Text>
          <Text style={br.metaTxt}>{items.length}가지 운동 · {totalSets}세트</Text>
        </View>
        <View style={br.metaBadge}>
          <Text style={br.metaIcon}>😴</Text>
          <Text style={br.metaTxt}>세트 사이 {restSeconds}초 휴식</Text>
        </View>
      </View>

      {/* 처방 이유 (더블 프로그레션 결과) */}
      {progressionMessages.length > 0 && (
        <View style={br.progressionCard}>
          <Text style={br.progressionLabel}>트레이너 메모</Text>
          {progressionMessages.map((msg, i) => (
            <Text key={i} style={br.progressionMsg}>{msg}</Text>
          ))}
        </View>
      )}

      <View style={br.list}>
        {items.map((item, i) => {
          const ex = item.exercise
          const p = (item.prescribed as any).progression
          const progressionBadge =
            p === 'weight_up'   ? { label: '↑ 무게 UP',  color: '#34C759' } :
            p === 'sets_up'     ? { label: '+ 세트 UP',  color: '#007AFF' } :
            p === 'weight_down' ? { label: '↓ 조정',     color: '#FF9500' } : null

          return (
            <View key={item.prescribed.exerciseId} style={br.card}>
              <View style={br.cardNum}>
                <Text style={br.cardNumTxt}>{i + 1}</Text>
              </View>
              {ex.gif_url ?? ex.image_url ? (
                <Image source={{ uri: ex.gif_url ?? ex.image_url ?? '' }} style={br.img} resizeMode="cover" />
              ) : (
                <View style={[br.img, br.imgPlaceholder]}>
                  <Text style={{ fontSize: 24 }}>💪</Text>
                </View>
              )}
              <View style={br.cardBody}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={br.exName} numberOfLines={1}>{ex.name_ko}</Text>
                  {progressionBadge && (
                    <View style={[br.progBadge, { backgroundColor: progressionBadge.color + '22', borderColor: progressionBadge.color + '55' }]}>
                      <Text style={[br.progBadgeTxt, { color: progressionBadge.color }]}>{progressionBadge.label}</Text>
                    </View>
                  )}
                </View>
                <Text style={br.exMeta}>
                  {MUSCLE_KO[item.prescribed.muscleGroup] ?? item.prescribed.muscleGroup} · {item.prescribed.sets}세트 × {item.prescribed.targetReps}회
                </Text>
                {item.prescribed.suggestedWeightKg != null && (
                  <Text style={br.exWeight}>{item.prescribed.suggestedWeightKg}kg 예정</Text>
                )}
              </View>
              <TouchableOpacity
                style={br.replaceBtn}
                onPress={() => onReplace(i, ex.primary_muscles[0] as MuscleGroup)}
                activeOpacity={0.7}
              >
                <Text style={br.replaceBtnTxt}>교체</Text>
              </TouchableOpacity>
            </View>
          )
        })}
      </View>

      <TouchableOpacity style={br.startBtn} onPress={onStart} activeOpacity={0.85}>
        <Text style={br.startBtnTxt}>시작하기 →</Text>
      </TouchableOpacity>
    </ScrollView>
  )
}

const br = StyleSheet.create({
  content:      { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 60 },
  label:        { fontSize: 11, fontWeight: '700', color: colors.mint, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8 },
  title:        { fontSize: 26, fontWeight: '800', color: colors.textPrimary, letterSpacing: -0.5, marginBottom: 14 },
  metaRow:      { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 },
  metaBadge:    { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.surface, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  metaIcon:     { fontSize: 13 },
  metaTxt:      { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
  list:         { gap: 10, marginBottom: 32 },
  card:         { backgroundColor: colors.surface, borderRadius: 14, flexDirection: 'row', alignItems: 'center', overflow: 'hidden' },
  cardNum:      { width: 36, alignItems: 'center', justifyContent: 'center', paddingVertical: 12 },
  cardNumTxt:   { fontSize: 13, fontWeight: '700', color: colors.textTertiary },
  img:          { width: 72, height: 72 },
  imgPlaceholder: { backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  cardBody:     { flex: 1, paddingHorizontal: 12, paddingVertical: 12, gap: 3 },
  exName:       { fontSize: 14, fontWeight: '700', color: colors.textPrimary, letterSpacing: -0.2 },
  exMeta:       { fontSize: 12, color: colors.textTertiary },
  exWeight:     { fontSize: 12, fontWeight: '600', color: colors.mint },
  replaceBtn:   { paddingHorizontal: 12, paddingVertical: 8, marginRight: 8 },
  replaceBtnTxt:{ fontSize: 12, fontWeight: '700', color: '#FF3B30' },
  startBtn:     { backgroundColor: colors.mint, borderRadius: 18, paddingVertical: 20, alignItems: 'center' },
  startBtnTxt:  { fontSize: 17, fontWeight: '700', color: '#fff' },
  deloadBanner:       { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FF980015', borderRadius: 14, padding: 14, gap: 10, marginBottom: 12, borderWidth: 1, borderColor: '#FF980035' },
  deloadEmoji:        { fontSize: 20 },
  deloadTitle:        { fontSize: 13, fontWeight: '700', color: '#FF9800', marginBottom: 2 },
  deloadSub:          { fontSize: 12, color: '#FF9800CC', lineHeight: 17 },
  proteinBanner:      { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#FF3B3015', borderRadius: 14, padding: 14, gap: 10, marginBottom: 12, borderWidth: 1, borderColor: '#FF3B3035' },
  proteinBannerTitle: { fontSize: 13, fontWeight: '700', color: '#FF3B30', marginBottom: 2 },
  progressionCard:    { backgroundColor: colors.surface, borderRadius: 14, padding: 14, marginBottom: 16, gap: 6, borderLeftWidth: 3, borderLeftColor: colors.mint },
  progressionLabel:   { fontSize: 11, fontWeight: '700', color: colors.mint, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  progressionMsg:     { fontSize: 13, color: colors.textSecondary, lineHeight: 19 },
  progBadge:          { borderRadius: 6, borderWidth: 1, paddingHorizontal: 5, paddingVertical: 2 },
  progBadgeTxt:       { fontSize: 10, fontWeight: '700' },
})

// ─── 운동 교체 바텀시트 ───────────────────────────────────────────────────────

const EQUIPMENT_FILTERS: { value: string; label: string }[] = [
  { value: 'all',            label: '전체' },
  { value: 'barbell',        label: '바벨' },
  { value: 'dumbbell',       label: '덤벨' },
  { value: 'machine',        label: '머신' },
  { value: 'cable',          label: '케이블' },
  { value: 'none',           label: '맨몸' },
  { value: 'kettlebell',     label: '케틀벨' },
  { value: 'resistance_band',label: '밴드' },
]

const TILE_SIZE = (SW - 20 * 2 - 10) / 2  // 2열, 좌우 패딩 20, gap 10

function ReplaceSheet({
  muscle,
  currentExId,
  onClose,
  onSelect,
}: {
  muscle: MuscleGroup
  currentExId: string
  onClose: () => void
  onSelect: (ex: Exercise) => void
}) {
  const [search,    setSearch]    = useState('')
  const [equipment, setEquipment] = useState('all')

  const list = useMemo(() => {
    let base = (exercises as Exercise[]).filter(
      (e) => e.primary_muscles.includes(muscle) && e.id !== currentExId
    )
    if (equipment !== 'all') base = base.filter((e) => e.equipment === equipment)
    if (search.trim()) {
      const q = search.toLowerCase()
      base = base.filter((e) => e.name_ko.toLowerCase().includes(q) || e.name.toLowerCase().includes(q))
    }
    return base.slice(0, 40)
  }, [muscle, currentExId, equipment, search])

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <TouchableOpacity style={rs.backdrop} activeOpacity={1} onPress={onClose} />
      <View style={rs.sheet}>
        <View style={rs.handle} />
        <View style={rs.header}>
          <Text style={rs.title}>{MUSCLE_KO[muscle] ?? muscle} 운동 교체</Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={rs.close}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* 검색 */}
        <TextInput
          style={rs.search}
          placeholder="운동 검색..."
          placeholderTextColor={colors.textTertiary}
          value={search}
          onChangeText={setSearch}
        />

        {/* 장비 필터 칩 */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={rs.filterScroll}
          contentContainerStyle={rs.filterRow}
        >
          {EQUIPMENT_FILTERS.map((f) => (
            <TouchableOpacity
              key={f.value}
              style={[rs.filterChip, equipment === f.value && rs.filterChipActive]}
              onPress={() => setEquipment(f.value)}
              activeOpacity={0.75}
            >
              <Text style={[rs.filterChipTxt, equipment === f.value && rs.filterChipTxtActive]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* 바둑판 그리드 */}
        <FlatList
          data={list}
          keyExtractor={(item) => item.id}
          numColumns={2}
          columnWrapperStyle={rs.gridRow}
          contentContainerStyle={rs.gridContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={rs.tile}
              onPress={() => onSelect(item)}
              activeOpacity={0.8}
            >
              {(item.gif_url ?? item.image_url) ? (
                <Image source={{ uri: item.gif_url ?? item.image_url ?? '' }} style={rs.tileImg} resizeMode="cover" />
              ) : (
                <View style={[rs.tileImg, rs.tileImgPlaceholder]}>
                  <Text style={{ fontSize: 32 }}>💪</Text>
                </View>
              )}
              <View style={rs.tileMeta}>
                <Text style={rs.tileName} numberOfLines={2}>{item.name_ko}</Text>
                <Text style={rs.tileEquip}>{EQUIPMENT_KO[item.equipment] ?? item.equipment}</Text>
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <Text style={rs.empty}>운동 목록이 없어요</Text>
          }
        />
      </View>
    </Modal>
  )
}

const rs = StyleSheet.create({
  backdrop:           { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet:              { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 12, paddingBottom: 40, maxHeight: '85%' },
  handle:             { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.borderSoft, alignSelf: 'center', marginBottom: 14 },
  header:             { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 12 },
  title:              { fontSize: 17, fontWeight: '700', color: colors.textPrimary },
  close:              { fontSize: 18, color: colors.textTertiary },
  search:             { marginHorizontal: 20, backgroundColor: colors.background, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: colors.textPrimary, fontSize: 14, marginBottom: 10 },
  filterScroll:       { flexShrink: 0, marginBottom: 14 },
  filterRow:          { paddingHorizontal: 20, paddingRight: 20, gap: 8 },
  filterChip:         { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.borderSoft },
  filterChipActive:   { backgroundColor: '#FF3B30', borderColor: '#FF3B30' },
  filterChipTxt:      { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  filterChipTxtActive:{ color: '#fff' },
  gridContent:        { paddingHorizontal: 20, paddingBottom: 20 },
  gridRow:            { gap: 10, marginBottom: 10 },
  tile:               { width: TILE_SIZE, backgroundColor: colors.background, borderRadius: 14, overflow: 'hidden' },
  tileImg:            { width: '100%', height: TILE_SIZE * 0.7 },
  tileImgPlaceholder: { backgroundColor: colors.borderSoft, alignItems: 'center', justifyContent: 'center' },
  tileMeta:           { padding: 10, gap: 3 },
  tileName:           { fontSize: 13, fontWeight: '600', color: colors.textPrimary, lineHeight: 17 },
  tileEquip:          { fontSize: 11, color: colors.textTertiary, fontWeight: '500' },
  empty:              { color: colors.textTertiary, textAlign: 'center', padding: 32, width: '100%' },
})

// ─── Phase 2: 워밍업 ──────────────────────────────────────────────────────────

function WarmupPhase({
  exercise,
  targetWeight,
  onDone,
}: {
  exercise: Exercise
  targetWeight: number | null
  onDone: () => void
}) {
  const warmups = targetWeight && targetWeight > 20
    ? [
        { weight: 20,                         reps: 15, label: '빈 봉' },
        { weight: roundWeight(targetWeight * 0.6), reps: 8,  label: '60%' },
      ]
    : [{ weight: 0, reps: 15, label: '맨몸 워밍업' }]

  const [step, setStep] = useState(0)
  const current = warmups[step]

  return (
    <View style={wu.root}>
      <Text style={wu.label}>워밍업</Text>
      <Text style={wu.exName}>{exercise.name_ko}</Text>

      {(exercise.gif_url ?? exercise.image_url) ? (
        <Image source={{ uri: exercise.gif_url ?? exercise.image_url ?? '' }} style={wu.img} resizeMode="cover" />
      ) : (
        <View style={[wu.img, wu.imgPlaceholder]}>
          <Text style={{ fontSize: 48 }}>💪</Text>
        </View>
      )}

      <View style={wu.setCard}>
        <Text style={wu.setLabel}>{current.label}</Text>
        <Text style={wu.setDetail}>
          {current.weight > 0 ? `${current.weight}kg × ` : ''}{current.reps}회
        </Text>
      </View>

      <Text style={wu.hint}>워밍업은 기록에 포함되지 않아요</Text>

      <View style={wu.btnRow}>
        {step < warmups.length - 1 ? (
          <TouchableOpacity style={wu.nextBtn} onPress={() => setStep((s) => s + 1)} activeOpacity={0.85}>
            <Text style={wu.nextBtnTxt}>다음 워밍업</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={wu.doneBtn} onPress={onDone} activeOpacity={0.85}>
            <Text style={wu.doneBtnTxt}>본 운동 시작 →</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={wu.skipBtn} onPress={onDone} activeOpacity={0.8}>
          <Text style={wu.skipBtnTxt}>워밍업 건너뛰기</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const wu = StyleSheet.create({
  root:        { flex: 1, alignItems: 'center', paddingHorizontal: 24, paddingTop: 16 },
  label:       { fontSize: 11, fontWeight: '700', color: colors.mint, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8 },
  exName:      { fontSize: 22, fontWeight: '800', color: colors.textPrimary, letterSpacing: -0.4, marginBottom: 20, textAlign: 'center' },
  img:         { width: SW - 48, height: 200, borderRadius: 20, marginBottom: 24 },
  imgPlaceholder: { backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  setCard:     { backgroundColor: colors.surface, borderRadius: 16, paddingVertical: 24, paddingHorizontal: 40, alignItems: 'center', marginBottom: 12, width: '100%' },
  setLabel:    { fontSize: 13, color: colors.textTertiary, fontWeight: '600', marginBottom: 6 },
  setDetail:   { fontSize: 32, fontWeight: '800', color: colors.textPrimary, letterSpacing: -0.5 },
  hint:        { fontSize: 12, color: colors.textTertiary, marginBottom: 32 },
  btnRow:      { width: '100%', gap: 10 },
  nextBtn:     { backgroundColor: colors.mint, borderRadius: 16, paddingVertical: 17, alignItems: 'center' },
  nextBtnTxt:  { fontSize: 16, fontWeight: '700', color: '#fff' },
  doneBtn:     { backgroundColor: colors.mint, borderRadius: 16, paddingVertical: 17, alignItems: 'center' },
  doneBtnTxt:  { fontSize: 16, fontWeight: '700', color: '#fff' },
  skipBtn:     { paddingVertical: 14, alignItems: 'center' },
  skipBtnTxt:  { fontSize: 14, fontWeight: '600', color: colors.textTertiary },
})

// ─── Exercise Image with fallback ────────────────────────────────────────────

function ExerciseImage({ uri, style }: { uri: string; style: object }) {
  const [failed, setFailed] = useState(false)
  if (failed) {
    return (
      <View style={[style, ses.exImgPlaceholder]}>
        <Text style={ses.exImgEmoji}>💪</Text>
      </View>
    )
  }
  return (
    <Image
      source={{ uri }}
      style={style}
      resizeMode="cover"
      onError={() => setFailed(true)}
    />
  )
}

// ─── Phase 3: 세션 (핵심) ─────────────────────────────────────────────────────

function SessionPhase({
  items,
  buildGoal,
  onComplete,
}: {
  items: WorkoutItem[]
  buildGoal: string
  onComplete: (sets: CompletedSet[], totalSec: number) => void
}) {
  const available = items

  const [exIdx,       setExIdx]       = useState(0)
  const [setIdx,      setSetIdx]      = useState(0)
  const [step,        setStep]        = useState<SessionStep>('active')
  const [timerRunning, setTimerRunning] = useState(false) // 세트 시작 버튼 누른 후 true
  const [elapsed,     setElapsed]     = useState(0)     // 세트 타이머 (카운트업)
  const [restLeft,    setRestLeft]    = useState(0)     // 휴식 타이머 (카운트다운)
  const [totalSec,    setTotalSec]    = useState(0)     // 세션 전체 시간
  const [flash,       setFlash]       = useState(false)
  const [infoVisible, setInfoVisible] = useState(false)
  const [completedSets, setCompletedSets] = useState<CompletedSet[]>([])
  const [actualReps,  setActualReps]  = useState<number>(0)

  // 현재 운동의 처방 중량 기반 — RPE로 실시간 조정
  const currentItem = available[exIdx]
  const currentEx   = currentItem?.exercise
  const prescribed  = currentItem?.prescribed

  // 각 세트의 중량 상태
  const [weights, setWeights] = useState<(number | undefined)[]>(() => {
    return available.map((item) =>
      item.prescribed.suggestedWeightKg ?? undefined
    )
  })
  const currentWeight = weights[exIdx] ?? 0
  const totalSets = prescribed?.sets ?? 3

  // step이 active로 바뀌면 timerRunning 리셋 (무게 재확인 유도)
  useEffect(() => {
    if (step === 'active') {
      setTimerRunning(false)
      setElapsed(0)
    }
  }, [step, setIdx, exIdx])

  // ── 세트 타이머 (카운트업) — timerRunning일 때만 동작
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null)
  useEffect(() => {
    if (timerRunning) {
      elapsedRef.current = setInterval(() => setElapsed((e) => e + 1), 1000)
    } else {
      if (elapsedRef.current) clearInterval(elapsedRef.current)
    }
    return () => { if (elapsedRef.current) clearInterval(elapsedRef.current) }
  }, [timerRunning])

  // ── 전체 세션 타이머
  const totalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  useEffect(() => {
    totalRef.current = setInterval(() => setTotalSec((t) => t + 1), 1000)
    return () => { if (totalRef.current) clearInterval(totalRef.current) }
  }, [])

  // ── 휴식 타이머 (카운트다운)
  const restRef = useRef<ReturnType<typeof setInterval> | null>(null)
  useEffect(() => {
    if (step !== 'rest') {
      if (restRef.current) clearInterval(restRef.current)
      return
    }
    restRef.current = setInterval(() => {
      setRestLeft((r) => {
        if (r <= 1) {
          clearInterval(restRef.current!)
          setFlash(true)
          setTimeout(() => setFlash(false), 800)
          return 0
        }
        return r - 1
      })
    }, 1000)
    return () => { if (restRef.current) clearInterval(restRef.current) }
  }, [step])

  const restSeconds = REST_SECONDS[buildGoal] ?? 90

  const handleSetDone = () => {
    setActualReps(prescribed?.targetReps ?? 8)
    setStep('rpe')
  }

  const handleRpe = (rpe: RPE) => {
    const opt = RPE_OPTIONS.find((o) => o.value === rpe)!
    const reps = actualReps

    // 완료 세트 기록
    setCompletedSets((prev) => [
      ...prev,
      { exerciseId: currentEx!.id, setIndex: setIdx, weight_kg: currentWeight, reps, rpe },
    ])

    // 즉시 중량 조정 (다음 세트용)
    if (opt.weightDelta !== 0) {
      setWeights((prev) => {
        const next = [...prev]
        next[exIdx] = roundWeight(Math.max(0, (next[exIdx] ?? 0) + opt.weightDelta))
        return next
      })
    }

    const isLastSet = setIdx >= totalSets - 1
    const isLastEx  = exIdx >= available.length - 1

    if (isLastSet && isLastEx) {
      // 모든 운동 완료
      if (totalRef.current) clearInterval(totalRef.current)
      onComplete(completedSets.concat({ exerciseId: currentEx!.id, setIndex: setIdx, weight_kg: currentWeight, reps, rpe }), totalSec)
      return
    }

    if (isLastSet) {
      // 다음 운동으로
      setStep('next_exercise')
    } else {
      // 휴식 타이머
      setRestLeft(restSeconds)
      setStep('rest')
    }
  }

  const handleRestSkip = () => {
    setRestLeft(0)
    if (restRef.current) clearInterval(restRef.current)
    setSetIdx((s) => s + 1)
    setStep('active')
  }

  const handleRestFinishAuto = useCallback(() => {
    setSetIdx((s) => s + 1)
    setStep('active')
  }, [])

  useEffect(() => {
    if (step === 'rest' && restLeft === 0) {
      handleRestFinishAuto()
    }
  }, [restLeft, step])

  const handleNextExercise = () => {
    const nextItem = available[exIdx + 1]
    setExIdx((e) => e + 1)
    setSetIdx(0)
    // compound 운동은 워밍업 먼저
    if (nextItem && isCompoundEx(nextItem.exercise.name)) {
      setStep('inter_warmup')
    } else {
      setStep('active')
    }
  }

  if (!currentItem || !currentEx || !prescribed) return null

  // ── Active (세트 진행 중)
  if (step === 'active') {
    return (
      <View style={ses.root}>
        <FlashOverlay visible={false} />

        {/* 진행도 헤더 */}
        <View style={ses.progressHeader}>
          <Text style={ses.progressTxt}>
            {exIdx + 1} / {available.length} 운동
          </Text>
          <View style={ses.progressTrack}>
            <View style={[ses.progressFill, { width: `${((exIdx) / available.length) * 100}%` as any }]} />
          </View>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={ses.content}
          showsVerticalScrollIndicator={false}
        >
          {/* 운동 이미지 */}
          {(currentEx.gif_url ?? currentEx.image_url) ? (
            <ExerciseImage uri={currentEx.gif_url ?? currentEx.image_url ?? ''} style={ses.exImg} />
          ) : (
            <View style={[ses.exImg, ses.exImgPlaceholder]}>
              <Text style={ses.exImgEmoji}>💪</Text>
              <Text style={ses.exImgName}>{currentEx.name_ko}</Text>
            </View>
          )}

          {/* 운동명 + 근육 */}
          <Text style={ses.exName}>{currentEx.name_ko}</Text>
          <Text style={ses.exMuscle}>
            {MUSCLE_KO[currentEx.primary_muscles[0]] ?? ''} · {EQUIPMENT_KO[currentEx.equipment] ?? currentEx.equipment}
          </Text>

          {/* 세트 진행 */}
          <View style={ses.setInfo}>
            <View style={ses.setNumWrap}>
              <Text style={ses.setNumLabel}>세트</Text>
              <Text style={ses.setNum}>{setIdx + 1}<Text style={ses.setTotal}> / {totalSets}</Text></Text>
            </View>
            <View style={ses.setDivider} />
            <View style={ses.setNumWrap}>
              <Text style={ses.setNumLabel}>목표 횟수</Text>
              <Text style={ses.setNum}>{prescribed.targetReps}<Text style={ses.setTotal}> 회</Text></Text>
            </View>
          </View>

          {/* 중량 조정 */}
          {currentEx.equipment !== 'none' ? (
            <>
              <View style={ses.weightRow}>
                <TouchableOpacity
                  style={ses.weightBtn}
                  onPress={() => setWeights((p) => { const n = [...p]; n[exIdx] = roundWeight(Math.max(0, (n[exIdx] ?? 0) - 2.5)); return n })}
                  activeOpacity={0.8}
                >
                  <Text style={ses.weightBtnTxt}>−2.5</Text>
                </TouchableOpacity>
                <View style={ses.weightDisplay}>
                  {currentWeight > 0 ? (
                    <Text style={ses.weightVal}>{currentWeight}</Text>
                  ) : (
                    <Text style={[ses.weightVal, ses.weightValEmpty]}>무게 입력</Text>
                  )}
                  <Text style={ses.weightUnit}>kg</Text>
                </View>
                <TouchableOpacity
                  style={ses.weightBtn}
                  onPress={() => setWeights((p) => { const n = [...p]; n[exIdx] = roundWeight((n[exIdx] ?? 0) + 2.5); return n })}
                  activeOpacity={0.8}
                >
                  <Text style={ses.weightBtnTxt}>+2.5</Text>
                </TouchableOpacity>
              </View>
              {currentWeight === 0 && (
                <Text style={ses.weightHint}>+2.5 버튼을 눌러 무게를 설정해주세요</Text>
              )}
            </>
          ) : (
            <View style={ses.bodyweightBadge}>
              <Text style={ses.bodyweightTxt}>맨몸 운동</Text>
            </View>
          )}

          {/* 세트 시작 전 — 시작 버튼 */}
          {!timerRunning ? (
            <TouchableOpacity
              style={[ses.doneBtn, (currentEx.equipment !== 'none' && currentWeight === 0) && ses.doneBtnDisabled]}
              onPress={() => setTimerRunning(true)}
              disabled={currentEx.equipment !== 'none' && currentWeight === 0}
              activeOpacity={0.85}
            >
              <Text style={ses.doneBtnTxt}>
                {currentEx.equipment !== 'none' && currentWeight === 0 ? '무게를 먼저 입력해주세요' : '세트 시작'}
              </Text>
            </TouchableOpacity>
          ) : (
            <>
              {/* 세트 타이머 */}
              <View style={ses.timerWrap}>
                <Text style={ses.timerVal}>{fmt(elapsed)}</Text>
                <Text style={ses.timerLabel}>세트 진행 시간</Text>
              </View>

              {/* 완료 버튼 */}
              <TouchableOpacity
                style={ses.doneBtn}
                onPress={handleSetDone}
                activeOpacity={0.85}
              >
                <Text style={ses.doneBtnTxt}>세트 완료</Text>
              </TouchableOpacity>
            </>
          )}


          {/* 이전 세트 기록 */}
          {completedSets.filter((s) => s.exerciseId === currentEx.id).length > 0 && (
            <View style={ses.prevSets}>
              <Text style={ses.prevSetsLabel}>이전 세트</Text>
              {completedSets
                .filter((s) => s.exerciseId === currentEx.id)
                .map((s, i) => {
                  const rpeOpt = RPE_OPTIONS.find((o) => o.value === s.rpe)!
                  return (
                    <View key={i} style={ses.prevSetRow}>
                      <Text style={ses.prevSetTxt}>세트 {s.setIndex + 1}</Text>
                      <Text style={ses.prevSetTxt}>{s.weight_kg > 0 ? `${s.weight_kg}kg ×` : ''} {s.reps}회</Text>
                      <Text style={[ses.prevSetRpe, { color: rpeOpt.color }]}>{rpeOpt.emoji} {rpeOpt.label}</Text>
                    </View>
                  )
                })}
            </View>
          )}

          {/* 운동 정보 버튼 */}
          <TouchableOpacity style={ses.infoBtn} onPress={() => setInfoVisible(true)} activeOpacity={0.8}>
            <Text style={ses.infoBtnTxt}>운동 정보 보기</Text>
          </TouchableOpacity>

          {/* 근육 히트맵 — 완료 세트 누적에 따라 점점 빨개짐 */}
          {(() => {
            const map: Partial<Record<MuscleGroup, number>> = {}
            for (const s of completedSets) {
              const ex = available.find((i) => i.exercise.id === s.exerciseId)?.exercise
              if (!ex) continue
              for (const m of ex.primary_muscles as MuscleGroup[]) map[m] = (map[m] ?? 0) + 1
              for (const m of ex.secondary_muscles as MuscleGroup[]) map[m] = (map[m] ?? 0) + 0.5
            }
            // 현재 운동 primary도 미리 표시 (현재 진행 중 운동 강조)
            for (const m of currentEx.primary_muscles as MuscleGroup[]) map[m] = (map[m] ?? 0) + 0.5
            const rounded: Partial<Record<MuscleGroup, number>> = {}
            for (const [k, v] of Object.entries(map)) rounded[k as MuscleGroup] = Math.ceil(v)
            return (
              <View style={ses.heatmapWrap}>
                <Text style={ses.heatmapLabel}>자극 부위</Text>
                <MuscleHeatmap muscleSetMap={rounded} scale={1.1} showToggle />
              </View>
            )
          })()}

        </ScrollView>

        {/* 운동 정보 모달 */}
        <Modal visible={infoVisible} transparent animationType="slide" onRequestClose={() => setInfoVisible(false)}>
          <TouchableOpacity style={ses.modalOverlay} activeOpacity={1} onPress={() => setInfoVisible(false)}>
            <TouchableOpacity style={ses.modalSheet} activeOpacity={1} onPress={() => {}}>
              <View style={ses.modalHandle} />
              <ScrollView showsVerticalScrollIndicator={false}>
                {/* GIF */}
                {(currentEx.gif_url ?? currentEx.image_url) ? (
                  <Image
                    source={{ uri: currentEx.gif_url ?? currentEx.image_url ?? '' }}
                    style={ses.modalImg}
                    resizeMode="cover"
                  />
                ) : null}

                <Text style={ses.modalExName}>{currentEx.name_ko}</Text>
                {currentEx.name_ko !== currentEx.name && (
                  <Text style={ses.modalExNameEn}>{currentEx.name}</Text>
                )}

                {/* 기본 정보 태그 */}
                <View style={ses.modalTags}>
                  {[
                    EQUIPMENT_KO[currentEx.equipment] ?? currentEx.equipment,
                    currentEx.difficulty,
                    currentEx.category,
                  ].filter(Boolean).map((tag) => (
                    <View key={tag} style={ses.modalTag}>
                      <Text style={ses.modalTagTxt}>{tag}</Text>
                    </View>
                  ))}
                </View>

                {/* 근육 */}
                <View style={ses.modalSection}>
                  <Text style={ses.modalSectionTitle}>주동근</Text>
                  <Text style={ses.modalSectionBody}>
                    {currentEx.primary_muscles.map((m: string) => MUSCLE_KO[m] ?? m).join(', ')}
                  </Text>
                </View>
                {currentEx.secondary_muscles?.length > 0 && (
                  <View style={ses.modalSection}>
                    <Text style={ses.modalSectionTitle}>보조근</Text>
                    <Text style={ses.modalSectionBody}>
                      {currentEx.secondary_muscles.map((m: string) => MUSCLE_KO[m] ?? m).join(', ')}
                    </Text>
                  </View>
                )}

                {/* 처방 정보 */}
                <View style={ses.modalSection}>
                  <Text style={ses.modalSectionTitle}>오늘 처방</Text>
                  <Text style={ses.modalSectionBody}>
                    {prescribed.sets}세트 × {prescribed.targetReps}회
                    {prescribed.suggestedWeightKg ? `  ·  추천 ${prescribed.suggestedWeightKg}kg` : ''}
                  </Text>
                </View>

                {/* 운동 설명 */}
                {currentEx.instructions?.length > 0 && (
                  <View style={ses.modalSection}>
                    <Text style={ses.modalSectionTitle}>수행 방법</Text>
                    {currentEx.instructions.map((step: string, i: number) => (
                      <View key={i} style={ses.modalStep}>
                        <Text style={ses.modalStepNum}>{i + 1}</Text>
                        <Text style={ses.modalStepTxt}>{step}</Text>
                      </View>
                    ))}
                  </View>
                )}

                <View style={{ height: 40 }} />
              </ScrollView>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      </View>
    )
  }

  // ── RPE 선택
  if (step === 'rpe') {
    return (
      <View style={rpe.root}>
        <Text style={rpe.title}>어땠나요?</Text>
        <Text style={rpe.sub}>실제 완료 횟수를 확인하고, 느낌을 선택해주세요</Text>
        <Text style={rpe.exName}>{currentEx.name_ko} — 세트 {setIdx + 1}</Text>

        {/* 실제 완료 횟수 stepper */}
        <View style={rpe.repsStepper}>
          <TouchableOpacity
            style={rpe.repsBtn}
            onPress={() => setActualReps((r) => Math.max(1, r - 1))}
            activeOpacity={0.8}
          >
            <Text style={rpe.repsBtnTxt}>−</Text>
          </TouchableOpacity>
          <View style={rpe.repsDisplay}>
            <Text style={rpe.repsVal}>{actualReps}</Text>
            <Text style={rpe.repsUnit}>회 완료</Text>
          </View>
          <TouchableOpacity
            style={rpe.repsBtn}
            onPress={() => setActualReps((r) => r + 1)}
            activeOpacity={0.8}
          >
            <Text style={rpe.repsBtnTxt}>+</Text>
          </TouchableOpacity>
        </View>
        {actualReps !== (prescribed?.targetReps ?? 8) && (
          <Text style={rpe.repsDiff}>
            목표 {prescribed?.targetReps ?? 8}회 대비 {actualReps < (prescribed?.targetReps ?? 8) ? `${(prescribed?.targetReps ?? 8) - actualReps}회 부족` : `${actualReps - (prescribed?.targetReps ?? 8)}회 초과`}
          </Text>
        )}

        {RPE_OPTIONS.map((opt) => (
          <TouchableOpacity
            key={opt.value}
            style={[rpe.card, { borderColor: opt.color }]}
            onPress={() => handleRpe(opt.value)}
            activeOpacity={0.8}
          >
            <Text style={rpe.emoji}>{opt.emoji}</Text>
            <View style={{ flex: 1 }}>
              <Text style={[rpe.label, { color: opt.color }]}>{opt.label}</Text>
              <Text style={rpe.hint}>
                {opt.weightDelta > 0 ? `다음 세트 +${opt.weightDelta}kg 제안` :
                 opt.weightDelta < 0 ? `다음 세트 ${opt.weightDelta}kg 조정` :
                 '현재 중량 유지'}
              </Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>
    )
  }

  // ── 휴식 타이머
  if (step === 'rest') {
    const restProgress = 1 - restLeft / restSeconds
    return (
      <View style={rst.root}>
        <FlashOverlay visible={flash} />
        <Text style={rst.title}>휴식 중</Text>
        <Text style={rst.nextLabel}>다음 세트 예고</Text>
        <Text style={rst.nextDetail}>
          {currentEx.name_ko} — 세트 {setIdx + 2} / {totalSets}
          {'\n'}{(weights[exIdx] ?? 0) > 0 ? `${weights[exIdx]}kg × ` : ''}{prescribed.targetReps}회
        </Text>

        {/* 원형 타이머 */}
        <View style={rst.timerWrap}>
          <View style={rst.timerCircle}>
            <Text style={rst.timerVal}>{restLeft}</Text>
            <Text style={rst.timerUnit}>초</Text>
          </View>
          <View style={[rst.timerProgress, { width: `${restProgress * 100}%` as any }]} />
        </View>

        <Text style={rst.timerNote}>
          {restLeft === 0 ? '시작하세요! 💥' : `${restLeft}초 후 자동 시작`}
        </Text>

        <TouchableOpacity style={rst.skipBtn} onPress={handleRestSkip} activeOpacity={0.8}>
          <Text style={rst.skipBtnTxt}>지금 시작할게요</Text>
        </TouchableOpacity>
      </View>
    )
  }

  // ── 다음 운동 전환
  if (step === 'next_exercise') {
    const nextItem = available[exIdx + 1]
    const nextEx   = nextItem?.exercise
    return (
      <View style={nxt.root}>
        <View style={nxt.doneWrap}>
          <Text style={nxt.doneEmoji}>✓</Text>
        </View>
        <Text style={nxt.doneLabel}>{currentEx.name_ko} 완료!</Text>

        {nextEx && (
          <>
            <Text style={nxt.nextLabel}>다음 운동</Text>
            <View style={nxt.nextCard}>
              {(nextEx.gif_url ?? nextEx.image_url) ? (
                <Image source={{ uri: nextEx.gif_url ?? nextEx.image_url ?? '' }} style={nxt.nextImg} resizeMode="cover" />
              ) : (
                <View style={[nxt.nextImg, nxt.nextImgPlaceholder]}>
                  <Text style={{ fontSize: 36 }}>💪</Text>
                </View>
              )}
              <View style={{ flex: 1, paddingLeft: 14, paddingVertical: 12 }}>
                <Text style={nxt.nextExName}>{nextEx.name_ko}</Text>
                <Text style={nxt.nextExMeta}>
                  {MUSCLE_KO[nextItem.prescribed.muscleGroup] ?? ''} · {nextItem.prescribed.sets}세트 × {nextItem.prescribed.targetReps}회
                </Text>
                {nextItem.prescribed.suggestedWeightKg != null && (
                  <Text style={nxt.nextExWeight}>{nextItem.prescribed.suggestedWeightKg}kg 예정</Text>
                )}
              </View>
            </View>
          </>
        )}

        <TouchableOpacity style={nxt.startBtn} onPress={handleNextExercise} activeOpacity={0.85}>
          <Text style={nxt.startBtnTxt}>다음 운동 시작 →</Text>
        </TouchableOpacity>
      </View>
    )
  }

  // ── 운동 간 워밍업 (compound 운동 전환 시)
  if (step === 'inter_warmup') {
    return (
      <WarmupPhase
        exercise={currentEx}
        targetWeight={weights[exIdx] ?? currentItem.prescribed.suggestedWeightKg}
        onDone={() => setStep('active')}
      />
    )
  }

  return null
}

const ses = StyleSheet.create({
  root:           { flex: 1 },
  progressHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 12 },
  progressTxt:    { fontSize: 13, fontWeight: '600', color: colors.textTertiary, minWidth: 60 },
  progressTrack:  { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.borderSoft, overflow: 'hidden' },
  progressFill:   { height: 4, borderRadius: 2, backgroundColor: colors.mint },
  content:        { paddingHorizontal: 20, paddingBottom: 60, alignItems: 'center' },
  exImg:          { width: SW - 40, height: 220, borderRadius: 20, marginBottom: 20 },
  exImgPlaceholder: { backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', gap: 8 },
  exImgEmoji:       { fontSize: 56 },
  exImgName:        { fontSize: 14, fontWeight: '600', color: colors.textTertiary, textAlign: 'center', paddingHorizontal: 16 },
  exName:         { fontSize: 24, fontWeight: '800', color: colors.textPrimary, letterSpacing: -0.5, textAlign: 'center', marginBottom: 6 },
  exMuscle:       { fontSize: 13, color: colors.textTertiary, marginBottom: 20 },
  setInfo:        { flexDirection: 'row', width: '100%', backgroundColor: colors.surface, borderRadius: 16, padding: 20, marginBottom: 20, alignItems: 'center' },
  setNumWrap:     { flex: 1, alignItems: 'center', gap: 4 },
  setNumLabel:    { fontSize: 11, fontWeight: '600', color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5 },
  setNum:         { fontSize: 36, fontWeight: '800', color: colors.textPrimary, letterSpacing: -0.8 },
  setTotal:       { fontSize: 18, fontWeight: '400', color: colors.textTertiary },
  setDivider:     { width: 1, height: 48, backgroundColor: colors.borderSoft },
  weightRow:      { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 20, width: '100%' },
  weightBtn:      { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: colors.borderSoft },
  weightBtnTxt:   { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  weightDisplay:  { flex: 1, alignItems: 'center' },
  weightVal:      { fontSize: 44, fontWeight: '800', color: colors.textPrimary, letterSpacing: -1 },
  weightValEmpty: { fontSize: 20, color: colors.textTertiary, letterSpacing: 0 },
  weightUnit:     { fontSize: 14, color: colors.textTertiary, marginTop: -4 },
  weightHint:     { fontSize: 12, color: '#FF3B30', textAlign: 'center', marginTop: -12, marginBottom: 8 },
  bodyweightBadge:{ alignSelf: 'center', backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 10, marginBottom: 20 },
  bodyweightTxt:  { fontSize: 15, fontWeight: '600', color: colors.textSecondary },
  doneBtnDisabled:{ backgroundColor: colors.borderSoft },
  timerWrap:      { alignItems: 'center', marginBottom: 24 },
  timerVal:       { fontSize: 48, fontWeight: '800', color: colors.mint, letterSpacing: -1, fontVariant: ['tabular-nums'] },
  timerLabel:     { fontSize: 12, color: colors.textTertiary, marginTop: 2 },
  doneBtn:        { width: '100%', backgroundColor: colors.mint, borderRadius: 18, paddingVertical: 20, alignItems: 'center', marginBottom: 20 },
  doneBtnTxt:     { fontSize: 18, fontWeight: '700', color: '#fff' },
  prevSets:       { width: '100%', backgroundColor: colors.surface, borderRadius: 14, padding: 14, gap: 8 },
  prevSetsLabel:  { fontSize: 11, fontWeight: '600', color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 },
  prevSetRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  prevSetTxt:     { fontSize: 13, color: colors.textSecondary },
  prevSetRpe:     { fontSize: 13, fontWeight: '600' },

  // ── heatmap
  heatmapWrap:    { width: '100%', backgroundColor: colors.surface, borderRadius: 16, padding: 16, alignItems: 'center', gap: 10, marginTop: 8 },
  heatmapLabel:   { alignSelf: 'flex-start', fontSize: 12, fontWeight: '700', color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.4 },

  // ── info button
  infoBtn:        { width: '100%', backgroundColor: colors.surface, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 10, marginBottom: 10, borderWidth: 1, borderColor: colors.borderSoft },
  infoBtnTxt:     { fontSize: 14, fontWeight: '600', color: colors.textSecondary },

  // ── info modal
  modalOverlay:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalSheet:     { backgroundColor: colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 12, maxHeight: '90%' },
  modalHandle:    { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.borderSoft, alignSelf: 'center', marginBottom: 20 },
  modalImg:       { width: '100%', height: 200, borderRadius: 16, marginBottom: 16 },
  modalExName:    { fontSize: 22, fontWeight: '800', color: colors.textPrimary, letterSpacing: -0.5, marginBottom: 4 },
  modalExNameEn:  { fontSize: 13, color: colors.textTertiary, marginBottom: 12 },
  modalTags:      { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 20 },
  modalTag:       { backgroundColor: colors.background, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  modalTagTxt:    { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
  modalSection:   { marginBottom: 18 },
  modalSectionTitle: { fontSize: 12, fontWeight: '700', color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 },
  modalSectionBody:  { fontSize: 15, color: colors.textPrimary, lineHeight: 22 },
  modalStep:      { flexDirection: 'row', gap: 10, marginBottom: 8 },
  modalStepNum:   { width: 22, height: 22, borderRadius: 11, backgroundColor: `${colors.mint}25`, textAlign: 'center', fontSize: 12, fontWeight: '700', color: colors.mint, lineHeight: 22 },
  modalStepTxt:   { flex: 1, fontSize: 14, color: colors.textSecondary, lineHeight: 20 },
})

const rpe = StyleSheet.create({
  root:         { flex: 1, paddingHorizontal: 24, paddingTop: 32 },
  title:        { fontSize: 28, fontWeight: '800', color: colors.textPrimary, letterSpacing: -0.5, marginBottom: 6 },
  sub:          { fontSize: 14, color: colors.textTertiary, marginBottom: 8 },
  exName:       { fontSize: 15, fontWeight: '600', color: colors.textSecondary, marginBottom: 20 },
  repsStepper:  { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: 16, padding: 16, marginBottom: 8, gap: 0 },
  repsBtn:      { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: colors.borderSoft },
  repsBtnTxt:   { fontSize: 20, fontWeight: '700', color: colors.textPrimary },
  repsDisplay:  { flex: 1, alignItems: 'center' },
  repsVal:      { fontSize: 36, fontWeight: '800', color: colors.textPrimary, letterSpacing: -0.8 },
  repsUnit:     { fontSize: 12, color: colors.textTertiary, marginTop: -2 },
  repsDiff:     { fontSize: 12, color: colors.mint, textAlign: 'center', marginBottom: 16 },
  card:         { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: 16, padding: 18, marginBottom: 12, borderWidth: 2, gap: 14 },
  emoji:        { fontSize: 32 },
  label:        { fontSize: 18, fontWeight: '700', marginBottom: 2 },
  hint:         { fontSize: 13, color: colors.textTertiary },
})

const rst = StyleSheet.create({
  root:          { flex: 1, alignItems: 'center', paddingHorizontal: 24, paddingTop: 40 },
  title:         { fontSize: 28, fontWeight: '800', color: colors.textPrimary, letterSpacing: -0.5, marginBottom: 8 },
  nextLabel:     { fontSize: 12, fontWeight: '600', color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  nextDetail:    { fontSize: 17, fontWeight: '600', color: colors.textPrimary, textAlign: 'center', lineHeight: 26, marginBottom: 32 },
  timerWrap:     { width: 160, height: 160, borderRadius: 80, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', marginBottom: 8, overflow: 'hidden', position: 'relative' },
  timerCircle:   { alignItems: 'center' },
  timerVal:      { fontSize: 52, fontWeight: '800', color: colors.mint, letterSpacing: -1, fontVariant: ['tabular-nums'] },
  timerUnit:     { fontSize: 14, color: colors.textTertiary },
  timerProgress: { position: 'absolute', bottom: 0, left: 0, height: 4, backgroundColor: colors.mint },
  timerNote:     { fontSize: 14, fontWeight: '600', color: colors.textSecondary, marginBottom: 32 },
  skipBtn:       { backgroundColor: colors.surface, borderRadius: 14, paddingVertical: 15, paddingHorizontal: 32, borderWidth: 1.5, borderColor: colors.borderSoft },
  skipBtnTxt:    { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
})

const nxt = StyleSheet.create({
  root:            { flex: 1, alignItems: 'center', paddingHorizontal: 24, paddingTop: 60 },
  doneWrap:        { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.mint, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  doneEmoji:       { fontSize: 32, color: '#fff', fontWeight: '700' },
  doneLabel:       { fontSize: 22, fontWeight: '800', color: colors.textPrimary, letterSpacing: -0.4, marginBottom: 32 },
  nextLabel:       { fontSize: 12, fontWeight: '600', color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12, alignSelf: 'flex-start' },
  nextCard:        { flexDirection: 'row', width: '100%', backgroundColor: colors.surface, borderRadius: 16, overflow: 'hidden', marginBottom: 32 },
  nextImg:         { width: 100, height: 100 },
  nextImgPlaceholder: { backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  nextExName:      { fontSize: 17, fontWeight: '700', color: colors.textPrimary, letterSpacing: -0.3, marginBottom: 4 },
  nextExMeta:      { fontSize: 12, color: colors.textTertiary, marginBottom: 4 },
  nextExWeight:    { fontSize: 13, fontWeight: '600', color: colors.mint },
  startBtn:        { width: '100%', backgroundColor: colors.mint, borderRadius: 16, paddingVertical: 18, alignItems: 'center' },
  startBtnTxt:     { fontSize: 17, fontWeight: '700', color: '#fff' },
})

// ─── AI Coach ────────────────────────────────────────────────────────────────

interface WeeklyHistory {
  weekLabel: string
  totalVolume: number
  totalSets: number
  proteinRatio: number
}

async function fetchGeminiCoachFeedback(
  sets: CompletedSet[],
  items: WorkoutItem[],
  totalSec: number,
  buildInfo: BuildBodyInfo,
  weeklyHistory: WeeklyHistory[],
): Promise<string> {
  const exerciseSummary = items
    .map((item) => {
      const exSets = sets.filter((s) => s.exerciseId === item.exercise.id)
      if (exSets.length === 0) return null
      const setLines = exSets
        .map((s) => `  세트${s.setIndex + 1}: ${s.weight_kg > 0 ? `${s.weight_kg}kg×${s.reps}회` : `${s.reps}회`} (${RPE_OPTIONS.find((o) => o.value === s.rpe)?.label ?? s.rpe})`)
        .join('\n')
      return `${item.exercise.name_ko}\n${setLines}`
    })
    .filter(Boolean)
    .join('\n\n')

  const totalVolume = sets.reduce((s, c) => s + c.weight_kg * c.reps, 0)

  const { data, error } = await supabase.functions.invoke('workout-feedback', {
    body: {
      buildInfo: {
        build_goal: buildInfo.build_goal,
        experience_level: buildInfo.experience_level ?? 'beginner',
        weight: buildInfo.weight,
      },
      totalSec,
      totalSets: sets.length,
      totalVolume: Math.round(totalVolume),
      exerciseSummary,
      weeklyHistory,
    },
  })
  if (error) throw error
  return data?.feedback ?? ''
}

// ─── Phase 4: 세션 요약 ────────────────────────────────────────────────────────

function SummaryPhase({
  sets,
  items,
  totalSec,
  buildInfo,
  onHome,
}: {
  sets: CompletedSet[]
  items: WorkoutItem[]
  totalSec: number
  buildInfo: BuildBodyInfo | null
  onHome: () => void
}) {
  const available = items.filter((i) => i.available)
  const totalVolume = sets.reduce((sum, s) => sum + s.weight_kg * s.reps, 0)
  const totalSetsCount = sets.length

  const { logs: allExLogs } = useExerciseLogStore()
  const { logs: allMealLogs } = useDietStore()

  const [aiFeedback,     setAiFeedback]     = useState<string | null>(null)
  const [aiFeedbackErr,  setAiFeedbackErr]  = useState(false)
  const [aiFeedbackLoad, setAiFeedbackLoad] = useState(true)

  useEffect(() => {
    if (!buildInfo) {
      setAiFeedbackLoad(false)
      return
    }

    // 최근 4주 주간 히스토리 계산
    const proteinGoal = buildInfo.weight * (buildInfo.experience_level === 'advanced' ? 2.2 : buildInfo.experience_level === 'intermediate' ? 2.0 : 1.6)
    const weeklyHistory: WeeklyHistory[] = []
    for (let w = 1; w <= 4; w++) {
      const weekStart = new Date()
      weekStart.setDate(weekStart.getDate() - w * 7)
      weekStart.setHours(0, 0, 0, 0)
      const weekEnd = new Date()
      weekEnd.setDate(weekEnd.getDate() - (w - 1) * 7)
      weekEnd.setHours(0, 0, 0, 0)

      const weekExLogs = allExLogs.filter((l) => {
        const d = new Date(l.date)
        return d >= weekStart && d < weekEnd
      })
      const weekMealLogs = allMealLogs.filter((l) => {
        const d = new Date((l as any).date ?? l.created_at)
        return d >= weekStart && d < weekEnd
      })

      const totalVolume = weekExLogs.reduce((sum, l) =>
        sum + (l.sets ?? []).reduce((s, st) => s + (st.weight_kg ?? 0) * (st.reps ?? 0), 0), 0)
      const totalSetsCount = weekExLogs.reduce((sum, l) => sum + (l.sets?.length ?? 0), 0)

      // 그 주 날짜별 단백질 달성률 평균
      const dayMap: Record<string, number> = {}
      weekMealLogs.forEach((l) => {
        const date = (l as any).date ?? new Date(l.created_at).toLocaleDateString('en-CA')
        dayMap[date] = (dayMap[date] ?? 0) + l.total_nutrition.protein
      })
      const dayRatios = Object.values(dayMap).map((p) => Math.min(1, p / proteinGoal))
      const proteinRatio = dayRatios.length > 0
        ? dayRatios.reduce((a, b) => a + b, 0) / dayRatios.length
        : 0

      if (totalSetsCount > 0 || totalVolume > 0) {
        weeklyHistory.push({
          weekLabel: w === 1 ? '1주 전' : `${w}주 전`,
          totalVolume: Math.round(totalVolume),
          totalSets: totalSetsCount,
          proteinRatio,
        })
      }
    }

    fetchGeminiCoachFeedback(sets, items, totalSec, buildInfo, weeklyHistory)
      .then((text) => { setAiFeedback(text); setAiFeedbackLoad(false) })
      .catch(() => { setAiFeedbackErr(true); setAiFeedbackLoad(false) })
  }, [])

  // 운동별 요약
  const byExercise = available.map((item) => {
    const exSets = sets.filter((s) => s.exerciseId === item.exercise.id)
    const bestWeight = exSets.length > 0
      ? Math.max(...exSets.map((s) => s.weight_kg))
      : 0
    const worstRpeVal = exSets.length > 0
      ? exSets.reduce<string | null>((worst, cur) => {
          if (!cur.rpe) return worst
          if (!worst) return cur.rpe
          const rank: Record<string, number> = { easy: 0, moderate: 1, hard: 2, max: 3 }
          return (rank[cur.rpe] ?? 0) > (rank[worst] ?? 0) ? cur.rpe : worst
        }, null)
      : null
    const avgRpe = worstRpeVal ? RPE_OPTIONS.find((o) => o.value === worstRpeVal) : null
    return { item, exSets, bestWeight, avgRpe }
  }).filter((e) => e.exSets.length > 0)

  // 다음 세션 예고 — 더블 프로그레션 기반
  const nextWeights = available.map((item) => {
    const exSets = sets.filter((s) => s.exerciseId === item.exercise.id)
    if (exSets.length === 0) return null
    const baseSets = item.prescribed.sets
    const currentSets = exSets.length
    const maxWeight = Math.max(...exSets.map((s) => s.weight_kg ?? 0))
    // 세션 전체 세트 중 가장 힘든 RPE 기준 (마지막 세트만 보면 왜곡)
    const RPE_RANK: Record<string, number> = { easy: 0, moderate: 1, hard: 2, max: 3 }
    const worstRpe = exSets.reduce<string | null>((worst, cur) => {
      if (!cur.rpe) return worst
      if (!worst) return cur.rpe
      return (RPE_RANK[cur.rpe] ?? 0) > (RPE_RANK[worst] ?? 0) ? cur.rpe : worst
    }, null)
    const level = buildInfo?.experience_level ?? 'beginner'
    const { suggestedWeightKg, suggestedSets, progression } = suggestProgressiveOverload(
      maxWeight > 0 ? maxWeight : null, worstRpe, baseSets, currentSets, item.exercise.equipment, level,
    )
    const nextWeight = suggestedWeightKg ?? maxWeight
    const nextSets = suggestedSets ?? currentSets
    return {
      name: item.exercise.name_ko,
      current: maxWeight,
      next: nextWeight,
      currentSets,
      nextSets,
      progression,
    }
  }).filter(Boolean) as {
    name: string; current: number; next: number
    currentSets: number; nextSets: number
    progression: string
  }[]

  return (
    <ScrollView style={sum.scroll} contentContainerStyle={sum.root} showsVerticalScrollIndicator={false}>
      <View style={sum.checkCircle}>
        <Text style={sum.checkMark}>✓</Text>
      </View>
      <Text style={sum.title}>오늘 운동 완료! 🔥</Text>

      {/* AI 코치 피드백 */}
      {(aiFeedbackLoad || aiFeedback || aiFeedbackErr) && (
        <View style={sum.aiCard}>
          <View style={sum.aiHeader}>
            <Text style={sum.aiIcon}>🤖</Text>
            <Text style={sum.aiLabel}>AI 트레이너 피드백</Text>
            {aiFeedbackLoad && <Text style={sum.aiLoading}>분석 중...</Text>}
          </View>
          {aiFeedbackLoad ? (
            <View style={sum.aiSkeletonWrap}>
              <View style={sum.aiSkeleton} />
              <View style={[sum.aiSkeleton, { width: '70%' }]} />
            </View>
          ) : aiFeedbackErr ? (
            <Text style={sum.aiErrorTxt}>피드백을 불러오지 못했어요</Text>
          ) : (
            <Text style={sum.aiText}>{aiFeedback}</Text>
          )}
        </View>
      )}

      {/* 통계 카드 */}
      <View style={sum.statsCard}>
        <View style={sum.statCol}>
          <Text style={sum.statVal}>{fmt(totalSec)}</Text>
          <Text style={sum.statLbl}>총 시간</Text>
        </View>
        <View style={sum.statDiv} />
        <View style={sum.statCol}>
          <Text style={[sum.statVal, { color: colors.mint }]}>{totalSetsCount}</Text>
          <Text style={sum.statLbl}>총 세트</Text>
        </View>
        <View style={sum.statDiv} />
        <View style={sum.statCol}>
          <Text style={sum.statVal}>{totalVolume.toLocaleString()}</Text>
          <Text style={sum.statLbl}>총 볼륨 kg</Text>
        </View>
      </View>

      {/* 운동별 요약 */}
      <Text style={sum.sectionLabel}>운동별 요약</Text>
      {byExercise.map(({ item, exSets, bestWeight, avgRpe }) => (
        <View key={item.exercise.id} style={sum.exCard}>
          <View style={sum.exCardTop}>
            <Text style={sum.exCardName}>{item.exercise.name_ko}</Text>
            {avgRpe && (
              <Text style={[sum.exCardRpe, { color: avgRpe.color }]}>{avgRpe.emoji} {avgRpe.label}</Text>
            )}
          </View>
          <Text style={sum.exCardDetail}>
            {exSets.length}세트 · {bestWeight > 0 ? `최고 ${bestWeight}kg` : '맨몸'}
          </Text>
        </View>
      ))}

      {/* 다음 세션 예고 */}
      {nextWeights.some((n) => n.progression !== 'hold' && n.progression !== 'first_session') && (
        <>
          <Text style={sum.sectionLabel}>다음 세션 예고</Text>
          <View style={sum.nextCard}>
            {nextWeights.map((n, i) => {
              const badge =
                n.progression === 'weight_up' ? '⬆ 무게 UP' :
                n.progression === 'sets_up'   ? '+ 세트 UP' :
                n.progression === 'weight_down' ? '⬇ 무게 DOWN' : null
              return (
                <View key={i} style={sum.nextRow}>
                  <Text style={sum.nextName} numberOfLines={1}>{n.name}</Text>
                  <Text style={sum.nextWeight}>
                    {n.current > 0 ? `${n.current}kg` : '맨몸'}
                    {n.next !== n.current ? ` → ${n.next > 0 ? `${n.next}kg` : '맨몸'}` : ''}
                    {n.nextSets !== n.currentSets ? ` (${n.nextSets}세트)` : ''}
                    {badge ? `  ${badge}` : ''}
                  </Text>
                </View>
              )
            })}
          </View>
        </>
      )}

      <TouchableOpacity style={sum.homeBtn} onPress={onHome} activeOpacity={0.85}>
        <Text style={sum.homeBtnTxt}>홈으로 →</Text>
      </TouchableOpacity>
    </ScrollView>
  )
}

const sum = StyleSheet.create({
  scroll:       { flex: 1 },
  root:         { alignItems: 'center', paddingHorizontal: 24, paddingTop: 40, paddingBottom: 60 },
  checkCircle:  { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.mint, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  checkMark:    { fontSize: 36, color: '#fff', fontWeight: '300' },
  title:        { fontSize: 26, fontWeight: '800', color: colors.textPrimary, letterSpacing: -0.5, marginBottom: 20 },
  statsCard:    { flexDirection: 'row', width: '100%', backgroundColor: colors.surface, borderRadius: 20, padding: 22, marginBottom: 24 },
  statCol:      { flex: 1, alignItems: 'center', gap: 4 },
  statVal:      { fontSize: 22, fontWeight: '800', color: colors.textPrimary, letterSpacing: -0.5 },
  statLbl:      { fontSize: 12, color: colors.textTertiary },
  statDiv:      { width: 1, height: 38, backgroundColor: colors.borderSoft },
  sectionLabel: { fontSize: 12, fontWeight: '600', color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5, alignSelf: 'flex-start', marginBottom: 10, marginTop: 8 },
  exCard:       { width: '100%', backgroundColor: colors.surface, borderRadius: 14, padding: 14, marginBottom: 8 },
  exCardTop:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  exCardName:   { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  exCardRpe:    { fontSize: 13, fontWeight: '600' },
  exCardDetail: { fontSize: 13, color: colors.textTertiary },
  nextCard:     { width: '100%', backgroundColor: colors.surface, borderRadius: 14, padding: 14, marginBottom: 24, gap: 10 },
  nextRow:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  nextName:     { fontSize: 14, color: colors.textSecondary, flex: 1 },
  nextWeight:   { fontSize: 14, fontWeight: '700', color: colors.mint },
  homeBtn:      { width: '100%', backgroundColor: colors.mint, borderRadius: 16, paddingVertical: 18, alignItems: 'center' },
  homeBtnTxt:   { fontSize: 17, fontWeight: '700', color: '#fff' },

  aiCard:        { width: '100%', backgroundColor: '#1A2A1A', borderRadius: 18, padding: 18, marginBottom: 20, borderWidth: 1, borderColor: `${colors.mint}40` },
  aiHeader:      { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  aiIcon:        { fontSize: 18 },
  aiLabel:       { fontSize: 13, fontWeight: '700', color: colors.mint, flex: 1 },
  aiLoading:     { fontSize: 11, color: colors.textTertiary },
  aiText:        { fontSize: 15, color: colors.textPrimary, lineHeight: 24, fontWeight: '400' },
  aiErrorTxt:    { fontSize: 13, color: colors.textTertiary, fontStyle: 'italic' },
  aiSkeletonWrap:{ gap: 8 },
  aiSkeleton:    { height: 14, borderRadius: 7, backgroundColor: colors.borderSoft, width: '100%' },
})

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function WorkoutScreen() {
  const insets = useSafeAreaInsets()
  const { bodyInfo, programStartedAt } = useAuthStore()
  const { addLog, logs: allLogs } = useExerciseLogStore()
  const { logs: allMealLogs } = useDietStore()
  const { replacedExerciseIds, recordReplaced } = useExerciseStore()
  const { setPostWorkoutCoach } = useUIStore()

  const today = getTodayString()
  const buildInfo = bodyInfo as BuildBodyInfo | null

  // 최신순 정렬 후 운동별 첫 번째 로그만 사용 (중량 + 마지막 세트 RPE + 세트 수)
  const lastWeightsMap: Record<string, number | null> = {}
  const lastRpesMap: Record<string, string | null> = {}
  const lastSetsCountMap: Record<string, number> = {}
  const sortedLogs = [...allLogs].sort((a, b) => b.created_at.localeCompare(a.created_at))
  sortedLogs.forEach((l) => {
    if (!l.sets || l.sets.length === 0) return
    const exId = l.exercise.id
    if (lastWeightsMap[exId] !== undefined) return
    const maxW = Math.max(...l.sets.map((s) => s.weight_kg ?? 0))
    lastWeightsMap[exId] = maxW > 0 ? maxW : null
    // 전체 세트 중 가장 힘든 RPE를 기준으로 사용 (마지막 세트만 보면 왜곡됨)
    const RPE_RANK: Record<string, number> = { easy: 0, moderate: 1, hard: 2, max: 3 }
    const worstRpe = l.sets.reduce<string | null>((worst, cur) => {
      if (!cur.rpe) return worst
      if (!worst) return cur.rpe
      return (RPE_RANK[cur.rpe] ?? 0) > (RPE_RANK[worst] ?? 0) ? cur.rpe : worst
    }, null)
    lastRpesMap[exId] = worstRpe
    lastSetsCountMap[exId] = l.sets.length
  })

  // 완료된 세션 수 — 날짜 기준 dedup (주기화 weekNumber 계산용)
  const completedSessionCount = new Set(
    allLogs.filter((l) => l.sets && l.sets.length > 0).map((l) => l.date)
  ).size

  // 최근 3주 주별 세션 수 — 딜로드 보정용 (주 2회 미만이면 딜로드 스킵)
  const recentWeekSessionCounts: [number, number, number] = (() => {
    const counts: [number, number, number] = [0, 0, 0]
    const sessionDates = new Set(
      allLogs.filter((l) => l.sets && l.sets.length > 0).map((l) => l.date)
    )
    sessionDates.forEach((dateStr) => {
      const d = new Date(dateStr)
      const now = new Date(); now.setHours(0, 0, 0, 0)
      const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000)
      if (diffDays >= 0 && diffDays < 7)   counts[0]++
      else if (diffDays >= 7 && diffDays < 14) counts[1]++
      else if (diffDays >= 14 && diffDays < 21) counts[2]++
    })
    return counts
  })()

  // 최근 3일 단백질 달성률 평균 (볼륨 보정용)
  const proteinGoal = buildInfo
    ? buildInfo.weight * (
        (buildInfo as any).experience_level === 'advanced' ? 2.2
        : (buildInfo as any).experience_level === 'intermediate' ? 2.0 : 1.6
      )
    : 160
  const proteinRatioLast3Days = (() => {
    const ratios: number[] = []
    for (let d = 1; d <= 3; d++) {
      const dt = new Date(); dt.setDate(dt.getDate() - d)
      const dateStr = dt.toLocaleDateString('en-CA')
      const dayProtein = allMealLogs
        .filter((l) => ((l as any).date ?? new Date(l.created_at).toLocaleDateString('en-CA')) === dateStr)
        .reduce((s, l) => s + l.total_nutrition.protein, 0)
      if (dayProtein > 0) ratios.push(Math.min(1, dayProtein / proteinGoal))
    }
    return ratios.length > 0 ? ratios.reduce((a, b) => a + b, 0) / ratios.length : 1
  })()

  const params = useLocalSearchParams<{ muscles?: string }>()
  const muscleGroups = params.muscles ? params.muscles.split(',') : []

  const prescribed: PrescribedExercise[] = buildInfo && muscleGroups.length > 0
    ? prescribeRoutine(
        buildInfo,
        muscleGroups,
        programStartedAt ?? undefined,
        lastWeightsMap,
        lastRpesMap,
        exercises,
        {
          lastSetsCount: lastSetsCountMap,
          replacedExerciseIds,
          completedSessionCount,
          proteinRatioLast3Days,
          recentWeekSessionCounts,
        },
      )
    : []

  // WorkoutItem 목록 구성
  const [items, setItems] = useState<WorkoutItem[]>(() =>
    prescribed.map((p) => ({
      prescribed: p,
      exercise: exercises.find((e) => e.id === p.exerciseId) ?? {
        id: p.exerciseId, name: p.exerciseId, name_ko: p.exerciseId,
        category: 'strength' as const, equipment: 'none' as const, difficulty: 'beginner' as const,
        primary_muscles: [p.muscleGroup as any], secondary_muscles: [], instructions: [],
      },
      available: true,
    }))
  )

  const isFirstSession = allLogs.filter((l) => l.sets && l.sets.length > 0).length === 0

  const deload = programStartedAt ? getDeloadStatus(programStartedAt) : null

  const [phase,         setPhase]       = useState<Phase>(isFirstSession ? 'first_guide' : 'briefing')
  const [completedSets, setCompletedSets] = useState<CompletedSet[]>([])
  const [totalSec,      setTotalSec]    = useState(0)

  const buildGoal = buildInfo?.build_goal ?? 'bulk'

  const handleStart = () => setPhase('warmup')

  const handleWarmupDone = () => setPhase('session')

  const handleSessionComplete = (sets: CompletedSet[], sec: number) => {
    setCompletedSets(sets)
    setTotalSec(sec)

    // exerciseLog에 저장
    if (buildInfo) {
      const byExercise: Record<string, CompletedSet[]> = {}
      sets.forEach((s) => {
        if (!byExercise[s.exerciseId]) byExercise[s.exerciseId] = []
        byExercise[s.exerciseId].push(s)
      })
      Object.entries(byExercise).forEach(([exId, exSets]) => {
        const ex = exercises.find((e) => e.id === exId)
        if (!ex) return
        const logSets: ExerciseSet[] = exSets.map((s) => ({
          set_number: s.setIndex + 1,
          reps: s.reps,
          weight_kg: s.weight_kg,
          rpe: s.rpe,
        }))
        addLog({
          id: `${Date.now()}-${exId}`,
          user_id: buildInfo.user_id,
          date: today,
          exercise: ex,
          sets: logSets,
          created_at: new Date().toISOString(),
        })
      })
    }

    setPhase('summary')
  }

  const handleHome = () => {
    // 오늘 운동한 근육 + 통계를 홈 화면 코치 배너용으로 저장
    const muscleSet = new Set<string>()
    items.forEach((item) => {
      const hasSets = completedSets.some((s) => s.exerciseId === item.exercise.id)
      if (hasSets) {
        item.exercise.primary_muscles.forEach((m) => muscleSet.add(m))
      }
    })
    const musclesKo = [...muscleSet].map((m) => MUSCLE_KO[m] ?? m)
    const totalSets = completedSets.length
    const totalVolume = Math.round(completedSets.reduce((sum, s) => sum + s.weight_kg * s.reps, 0))
    if (totalSets > 0) {
      setPostWorkoutCoach({ muscles: musclesKo, totalSets, totalVolume })
    }
    router.replace('/(tabs)')
  }

  const restSeconds = REST_SECONDS[buildGoal] ?? 90
  const firstAvailable = items[0]

  // 브리핑 / 세션 공통 교체 핸들러
  const [replaceTarget, setReplaceTarget] = useState<{ idx: number; muscle: MuscleGroup } | null>(null)

  const handleReplaceSelect = (newEx: Exercise) => {
    if (!replaceTarget) return
    setItems((prev) => {
      const next = [...prev]
      const old = next[replaceTarget.idx]
      // 교체된 원래 운동 ID를 store에 기록 — 다음 세션 처방에서 제외됨
      recordReplaced(old.exercise.id)
      next[replaceTarget.idx] = {
        ...old,
        exercise: newEx,
        prescribed: { ...old.prescribed, exerciseId: newEx.id },
      }
      return next
    })
    setReplaceTarget(null)
  }

  return (
    <View style={[main.root, { paddingTop: insets.top }]}>
      {/* 운동 교체 시트 — 브리핑/세션 공용 */}
      {replaceTarget && (
        <ReplaceSheet
          muscle={replaceTarget.muscle}
          currentExId={items[replaceTarget.idx]?.exercise.id ?? ''}
          onClose={() => setReplaceTarget(null)}
          onSelect={handleReplaceSelect}
        />
      )}

      {/* 헤더 */}
      {phase !== 'summary' && phase !== 'first_guide' && (
        <View style={main.header}>
          <TouchableOpacity onPress={() => {
            if (phase === 'briefing') router.back()
            else setPhase('briefing')
          }} activeOpacity={0.7}>
            <Text style={main.back}>← {phase === 'briefing' ? '나가기' : '오늘의 처방'}</Text>
          </TouchableOpacity>
          <Text style={main.headerTitle}>
            {phase === 'briefing' ? '오늘의 처방' :
             phase === 'warmup'   ? '워밍업' :
             phase === 'session'  ? '운동 중' : ''}
          </Text>
          <View style={{ width: 60 }} />
        </View>
      )}

      {phase === 'first_guide' && (
        <FirstSessionGuide onDone={() => setPhase('briefing')} />
      )}

      {phase === 'briefing' && items.length === 0 && (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 12 }}>
          <Text style={{ fontSize: 48 }}>😴</Text>
          <Text style={{ fontSize: 20, fontWeight: '800', color: colors.textPrimary, textAlign: 'center', letterSpacing: -0.4 }}>오늘은 휴식일이에요</Text>
          <Text style={{ fontSize: 14, color: colors.textTertiary, textAlign: 'center', lineHeight: 22 }}>충분한 휴식이 근육 회복을 도와요{'\n'}내일 더 강하게 돌아올 수 있어요</Text>
          <TouchableOpacity
            style={{ marginTop: 16, backgroundColor: colors.surface, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 32, borderWidth: 1, borderColor: colors.borderSoft }}
            onPress={() => router.back()}
            activeOpacity={0.8}
          >
            <Text style={{ fontSize: 15, fontWeight: '600', color: colors.textSecondary }}>← 돌아가기</Text>
          </TouchableOpacity>
        </View>
      )}

      {phase === 'briefing' && items.length > 0 && (
        <BriefingPhase
          items={items}
          isDeload={deload?.isDeload ?? false}
          currentWeek={deload?.currentWeek ?? 1}
          restSeconds={restSeconds}
          proteinLow={proteinRatioLast3Days < 0.70}
          onStart={handleStart}
          onReplace={(idx, muscle) => setReplaceTarget({ idx, muscle })}
        />
      )}

      {phase === 'warmup' && firstAvailable && (
        <WarmupPhase
          exercise={firstAvailable.exercise}
          targetWeight={firstAvailable.prescribed.suggestedWeightKg}
          onDone={handleWarmupDone}
        />
      )}
      {phase === 'session' && (
        <SessionPhase
          items={items}
          buildGoal={buildGoal}
          onComplete={handleSessionComplete}
        />
      )}
      {phase === 'summary' && (
        <SummaryPhase
          sets={completedSets}
          items={items}
          totalSec={totalSec}
          buildInfo={buildInfo}
          onHome={handleHome}
        />
      )}
    </View>
  )
}

const main = StyleSheet.create({
  root:        { flex: 1, backgroundColor: colors.background },
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 12 },
  back:        { fontSize: 14, fontWeight: '600', color: colors.textTertiary },
  headerTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
})

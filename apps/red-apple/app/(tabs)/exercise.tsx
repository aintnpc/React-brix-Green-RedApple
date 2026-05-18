import { useState, useMemo, useEffect, useRef } from 'react'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  View,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  SafeAreaView,
  Image,
  Dimensions,
  ActivityIndicator,
  Animated,
} from 'react-native'

const SW = Dimensions.get('window').width
const TILE_SIZE = (SW - 20 * 2 - 10) / 2
import { Text } from 'react-native'
import { colorsDark as colors, spacing } from '@repo/theme'
import { getTodayString, calculateBuildGoals, prescribeRoutine, getDeloadStatus } from '@repo/shared'
import type { MuscleGroup, Exercise, ExerciseSet, ExerciseLog, BuildBodyInfo, PrescribedExercise, RPE } from '@repo/shared'
import { useAuthStore } from '../../store/auth'
import { useExerciseLogStore } from '../../store/exerciseLog'
import { useExerciseStore } from '../../store/exercise'
import { useDietStore } from '../../store/diet'
import { MuscleHeatmap } from '../../components/muscle/MuscleHeatmap'
import exercisesRaw from '../../data/exercises.json'

const exercises = exercisesRaw as unknown as Exercise[]

const MUSCLE_KO: Record<string, string> = {
  chest: '가슴', back: '등', shoulders: '어깨', biceps: '이두', triceps: '삼두',
  forearms: '전완', abs: '복근', obliques: '옆구리', glutes: '둔근',
  quads: '대퇴사두', hamstrings: '햄스트링', calves: '종아리',
  traps: '승모근', lats: '광배근', lower_back: '허리',
}

const RPE_OPTIONS: { value: RPE; label: string; color: string }[] = [
  { value: 'easy',     label: '쉬움',   color: '#4CAF50' },
  { value: 'moderate', label: '적당',   color: '#FF9800' },
  { value: 'hard',     label: '힘듦',   color: '#F44336' },
  { value: 'max',      label: '한계',   color: '#9C27B0' },
]

// ─── Set Row ──────────────────────────────────────────────────────────────────

function SetRow({
  index, set, onChange, onRemove,
}: {
  index: number
  set: ExerciseSet
  onChange: (s: ExerciseSet) => void
  onRemove: () => void
}) {
  return (
    <View style={s.setRowWrap}>
      <View style={s.setRow}>
        <Text style={s.setNum}>{index + 1}</Text>
        <TextInput
          style={s.setInput}
          placeholder="kg"
          placeholderTextColor={colors.textTertiary}
          keyboardType="decimal-pad"
          value={set.weight_kg != null ? String(set.weight_kg) : ''}
          onChangeText={(v) => onChange({ ...set, weight_kg: v === '' ? undefined : parseFloat(v) || 0 })}
        />
        <Text style={s.setX}>×</Text>
        <TextInput
          style={s.setInput}
          placeholder="회"
          placeholderTextColor={colors.textTertiary}
          keyboardType="number-pad"
          value={set.reps != null ? String(set.reps) : ''}
          onChangeText={(v) => onChange({ ...set, reps: v === '' ? undefined : parseInt(v) || 0 })}
        />
        <TouchableOpacity onPress={onRemove} style={s.setRemove}>
          <Text style={{ color: colors.textTertiary, fontSize: 16 }}>✕</Text>
        </TouchableOpacity>
      </View>
      {/* RPE 버튼 */}
      <View style={s.rpeRow}>
        {RPE_OPTIONS.map((opt) => (
          <TouchableOpacity
            key={opt.value}
            style={[s.rpeBtn, set.rpe === opt.value && { backgroundColor: opt.color + '30', borderColor: opt.color }]}
            onPress={() => onChange({ ...set, rpe: set.rpe === opt.value ? undefined : opt.value })}
          >
            <Text style={[s.rpeTxt, set.rpe === opt.value && { color: opt.color }]}>{opt.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  )
}

// ─── Exercise Detail Modal ────────────────────────────────────────────────────

const DIFFICULTY_KO: Record<string, string> = {
  beginner: '초급', intermediate: '중급', advanced: '고급',
}
const EQUIPMENT_KO_DETAIL: Record<string, string> = {
  none: '맨몸', barbell: '바벨', dumbbell: '덤벨', machine: '머신',
  cable: '케이블', kettlebell: '케틀벨', resistance_band: '밴드',
}

function ExerciseDetailModal({
  exercise,
  onClose,
  onStartLog,
}: {
  exercise: Exercise
  onClose: () => void
  onStartLog?: () => void
}) {
  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <TouchableOpacity style={ed.backdrop} activeOpacity={1} onPress={onClose} />
      <View style={ed.sheet}>
        <View style={ed.handle} />

        {/* 헤더 */}
        <View style={ed.header}>
          <Text style={ed.title} numberOfLines={2}>{exercise.name_ko}</Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={ed.close}>✕</Text>
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={ed.body}>
          {/* GIF */}
          {(exercise.gif_url ?? exercise.image_url) ? (
            <Image
              source={{ uri: exercise.gif_url ?? exercise.image_url ?? '' }}
              style={ed.gif}
              resizeMode="contain"
            />
          ) : (
            <View style={[ed.gif, ed.gifPlaceholder]}>
              <Text style={{ fontSize: 48 }}>💪</Text>
            </View>
          )}

          {/* 메타 배지 */}
          <View style={ed.metaRow}>
            <View style={ed.metaBadge}>
              <Text style={ed.metaLabel}>난이도</Text>
              <Text style={ed.metaValue}>{DIFFICULTY_KO[exercise.difficulty] ?? exercise.difficulty}</Text>
            </View>
            <View style={ed.metaBadge}>
              <Text style={ed.metaLabel}>장비</Text>
              <Text style={ed.metaValue}>{EQUIPMENT_KO_DETAIL[exercise.equipment] ?? exercise.equipment}</Text>
            </View>
            <View style={ed.metaBadge}>
              <Text style={ed.metaLabel}>분류</Text>
              <Text style={ed.metaValue}>{exercise.category === 'strength' ? '근력' : exercise.category === 'cardio' ? '유산소' : '유연성'}</Text>
            </View>
          </View>

          {/* 근육 */}
          <View style={ed.section}>
            <Text style={ed.sectionTitle}>주동근</Text>
            <View style={ed.tagRow}>
              {exercise.primary_muscles.map((m) => (
                <View key={m} style={ed.tagPrimary}>
                  <Text style={ed.tagPrimaryTxt}>{MUSCLE_KO[m] ?? m}</Text>
                </View>
              ))}
            </View>
          </View>
          {exercise.secondary_muscles.length > 0 && (
            <View style={ed.section}>
              <Text style={ed.sectionTitle}>보조근</Text>
              <View style={ed.tagRow}>
                {exercise.secondary_muscles.map((m) => (
                  <View key={m} style={ed.tagSecondary}>
                    <Text style={ed.tagSecondaryTxt}>{MUSCLE_KO[m] ?? m}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* 수행 방법 */}
          {exercise.instructions.length > 0 && (
            <View style={ed.section}>
              <Text style={ed.sectionTitle}>수행 방법</Text>
              {exercise.instructions.map((inst, i) => (
                <View key={i} style={ed.instrRow}>
                  <View style={ed.instrNum}>
                    <Text style={ed.instrNumTxt}>{i + 1}</Text>
                  </View>
                  <Text style={ed.instrTxt}>{inst}</Text>
                </View>
              ))}
            </View>
          )}
        </ScrollView>

        {/* 기록하기 버튼 */}
        {onStartLog && (
          <View style={ed.footer}>
            <TouchableOpacity style={ed.logBtn} onPress={onStartLog} activeOpacity={0.85}>
              <Text style={ed.logBtnTxt}>이 운동 기록하기 →</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </Modal>
  )
}

const ed = StyleSheet.create({
  backdrop:         { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet:            { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 12, maxHeight: '92%' },
  handle:           { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.borderSoft, alignSelf: 'center', marginBottom: 14 },
  header:           { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: 20, marginBottom: 16 },
  title:            { fontSize: 20, fontWeight: '700', color: colors.textPrimary, flex: 1, marginRight: 12, letterSpacing: -0.3 },
  close:            { fontSize: 18, color: colors.textTertiary },
  body:             { paddingHorizontal: 20, paddingBottom: 16 },
  gif:              { width: '100%', height: 220, borderRadius: 16, backgroundColor: colors.background, marginBottom: 16 },
  gifPlaceholder:   { alignItems: 'center', justifyContent: 'center' },
  metaRow:          { flexDirection: 'row', gap: 8, marginBottom: 20 },
  metaBadge:        { flex: 1, backgroundColor: colors.background, borderRadius: 12, paddingVertical: 10, alignItems: 'center', gap: 4 },
  metaLabel:        { fontSize: 10, fontWeight: '600', color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5 },
  metaValue:        { fontSize: 13, fontWeight: '700', color: colors.textPrimary },
  section:          { marginBottom: 20 },
  sectionTitle:     { fontSize: 13, fontWeight: '700', color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  tagRow:           { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tagPrimary:       { backgroundColor: '#E83B3B22', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: '#E83B3B44' },
  tagPrimaryTxt:    { fontSize: 13, fontWeight: '600', color: '#E83B3B' },
  tagSecondary:     { backgroundColor: colors.background, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: colors.borderSoft },
  tagSecondaryTxt:  { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  instrRow:         { flexDirection: 'row', gap: 12, marginBottom: 12, alignItems: 'flex-start' },
  instrNum:         { width: 24, height: 24, borderRadius: 12, backgroundColor: '#E83B3B', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 },
  instrNumTxt:      { fontSize: 12, fontWeight: '700', color: '#fff' },
  instrTxt:         { fontSize: 14, color: colors.textSecondary, lineHeight: 22, flex: 1 },
  footer:           { paddingHorizontal: 20, paddingVertical: 16, borderTopWidth: 1, borderTopColor: colors.borderSoft },
  logBtn:           { backgroundColor: '#E83B3B', borderRadius: 16, height: 54, alignItems: 'center', justifyContent: 'center' },
  logBtnTxt:        { color: '#fff', fontSize: 16, fontWeight: '700', letterSpacing: -0.3 },
})

// ─── Set Logger Modal ─────────────────────────────────────────────────────────

function SetLoggerModal({
  exercise, initialWeight, suggestedWeight, onClose, onSave,
}: {
  exercise: Exercise
  initialWeight?: number | null
  suggestedWeight?: number | null
  onClose: () => void
  onSave: (sets: ExerciseSet[]) => void
}) {
  const [sets, setSets] = useState<ExerciseSet[]>([
    { set_number: 1, reps: undefined, weight_kg: initialWeight ?? undefined },
  ])

  const translateY = useRef(new Animated.Value(600)).current

  useEffect(() => {
    Animated.spring(translateY, {
      toValue: 0,
      useNativeDriver: true,
      damping: 50,
      stiffness: 400,
    }).start()
  }, [])

  const addSet = () =>
    setSets((prev) => [...prev, { set_number: prev.length + 1, reps: undefined, weight_kg: undefined }])

  const updateSet = (i: number, updated: ExerciseSet) =>
    setSets((prev) => prev.map((item, idx) => (idx === i ? updated : item)))

  const removeSet = (i: number) =>
    setSets((prev) => prev.filter((_, idx) => idx !== i).map((item, idx) => ({ ...item, set_number: idx + 1 })))

  const handleSave = () => {
    const valid = sets.filter((item) => item.reps != null && item.reps > 0)
    if (valid.length === 0) { onClose(); return }
    onSave(valid)
  }

  return (
    <Modal visible animationType="none" transparent onRequestClose={onClose}>
      <TouchableOpacity style={sl.backdrop} activeOpacity={1} onPress={onClose} />
      <Animated.View style={[sl.sheet, { transform: [{ translateY }] }]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={sl.handle} />

          {/* 헤더 */}
          <View style={sl.header}>
            <View style={{ flex: 1 }}>
              <Text style={sl.title} numberOfLines={1}>{exercise.name_ko}</Text>
              <Text style={sl.sub}>
                {MUSCLE_KO[exercise.primary_muscles[0]] ?? ''}
                {exercise.equipment !== 'none' ? ` · ${EQUIPMENT_KO_DETAIL[exercise.equipment] ?? exercise.equipment}` : ''}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={sl.close}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Progressive overload 힌트 */}
          {suggestedWeight != null && (
            <View style={sl.overloadBanner}>
              <Text style={sl.overloadIcon}>🔥</Text>
              <Text style={sl.overloadTxt}>
                목표 중량 <Text style={{ fontWeight: '800' }}>{suggestedWeight}kg</Text>  — 지난번보다 +2.5kg 도전!
              </Text>
            </View>
          )}

          {/* 세트 헤더 */}
          <View style={sl.setHeader}>
            <Text style={[sl.setHeaderCell, sl.colNum]}>세트</Text>
            <Text style={[sl.setHeaderCell, sl.colFlex]}>무게 (kg)</Text>
            <View style={sl.colX} />
            <Text style={[sl.setHeaderCell, sl.colFlex]}>횟수</Text>
            <View style={{ width: 28 }} />
          </View>

          {/* 세트 목록 */}
          <ScrollView style={sl.setScroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {sets.map((set, i) => (
              <SetRow
                key={i}
                index={i}
                set={set}
                onChange={(updated) => updateSet(i, updated)}
                onRemove={() => removeSet(i)}
              />
            ))}
          </ScrollView>

          {/* 세트 추가 */}
          <TouchableOpacity style={sl.addSetBtn} onPress={addSet} activeOpacity={0.7}>
            <Text style={sl.addSetTxt}>+ 세트 추가</Text>
          </TouchableOpacity>

          {/* 저장 버튼 */}
          <TouchableOpacity style={sl.saveBtn} onPress={handleSave} activeOpacity={0.85}>
            <Text style={sl.saveTxt}>기록 저장</Text>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </Animated.View>
    </Modal>
  )
}

const sl = StyleSheet.create({
  backdrop:      { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet:         { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 12, paddingHorizontal: 20, paddingBottom: 32 },
  handle:        { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.borderSoft, alignSelf: 'center', marginBottom: 16 },
  header:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  title:         { fontSize: 20, fontWeight: '700', color: colors.textPrimary, letterSpacing: -0.3 },
  sub:           { fontSize: 12, fontWeight: '500', color: colors.textTertiary, marginTop: 3 },
  close:         { fontSize: 18, color: colors.textTertiary },
  overloadBanner:{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: `${colors.mint}15`, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14, marginBottom: 16, borderWidth: 1, borderColor: `${colors.mint}35` },
  overloadIcon:  { fontSize: 15 },
  overloadTxt:   { fontSize: 13, color: colors.mint, flex: 1 },
  setHeader:     { flexDirection: 'row', alignItems: 'center', marginBottom: 8, paddingHorizontal: 2 },
  setHeaderCell: { color: colors.textTertiary, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  colNum:        { width: 24, textAlign: 'center' },
  colFlex:       { flex: 1, textAlign: 'center' },
  colX:          { width: 18 },
  setScroll:     { maxHeight: 280 },
  addSetBtn:     { alignItems: 'center', paddingVertical: 12, marginTop: 4, borderRadius: 12, borderWidth: 1.5, borderColor: colors.borderSoft, borderStyle: 'dashed', marginBottom: 14 },
  addSetTxt:     { color: colors.textSecondary, fontSize: 14, fontWeight: '600' },
  saveBtn:       { backgroundColor: colors.mint, borderRadius: 16, height: 54, alignItems: 'center', justifyContent: 'center' },
  saveTxt:       { color: '#fff', fontSize: 16, fontWeight: '700', letterSpacing: -0.3 },
})

// ─── Exercise List Bottom Sheet ───────────────────────────────────────────────

const EQUIPMENT_KO: Record<string, string> = {
  barbell: '바벨',
  dumbbell: '덤벨',
  cable: '케이블',
  machine: '머신',
  kettlebell: '케틀벨',
  resistance_band: '밴드',
  none: '맨몸',
}

const EQUIPMENT_FILTERS = [
  { value: 'all', label: '전체' },
  { value: 'barbell', label: '바벨' },
  { value: 'dumbbell', label: '덤벨' },
  { value: 'machine', label: '머신' },
  { value: 'cable', label: '케이블' },
  { value: 'none', label: '맨몸' },
  { value: 'kettlebell', label: '케틀벨' },
  { value: 'resistance_band', label: '밴드' },
]

function ExerciseBottomSheet({
  muscle, onClose, onSelectExercise,
}: {
  muscle: MuscleGroup
  onClose: () => void
  onSelectExercise: (ex: Exercise) => void
}) {
  const [search, setSearch] = useState('')
  const [equipment, setEquipment] = useState('all')
  const { favoriteIds, toggleFavorite } = useExerciseStore()

  const list = useMemo(() => {
    let result = exercises.filter(
      (e) => e.primary_muscles.includes(muscle) || e.secondary_muscles.includes(muscle)
    )
    if (equipment !== 'all') result = result.filter((e) => e.equipment === equipment)
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(
        (e) => e.name_ko.toLowerCase().includes(q) || e.name.toLowerCase().includes(q)
      )
    }
    return [...result].sort((a, b) => (favoriteIds.has(b.id) ? 1 : 0) - (favoriteIds.has(a.id) ? 1 : 0))
  }, [muscle, equipment, search, favoriteIds])

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <TouchableOpacity style={bs.backdrop} activeOpacity={1} onPress={onClose} />
      <View style={bs.sheet}>
        <View style={bs.handle} />
        <View style={bs.header}>
          <Text style={bs.title}>{MUSCLE_KO[muscle]} 운동</Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={bs.close}>✕</Text>
          </TouchableOpacity>
        </View>

        <TextInput
          style={bs.search}
          placeholder="운동 검색..."
          placeholderTextColor={colors.textTertiary}
          value={search}
          onChangeText={setSearch}
        />

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={bs.filterScroll}
          contentContainerStyle={bs.filterRow}
        >
          {EQUIPMENT_FILTERS.map((f) => (
            <TouchableOpacity
              key={f.value}
              style={[bs.filterChip, equipment === f.value && bs.filterChipActive]}
              onPress={() => setEquipment(f.value)}
              activeOpacity={0.75}
            >
              <Text style={[bs.filterChipTxt, equipment === f.value && bs.filterChipTxtActive]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <FlatList
          data={list}
          keyExtractor={(item) => item.id}
          numColumns={2}
          columnWrapperStyle={bs.gridRow}
          contentContainerStyle={bs.gridContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const fav = favoriteIds.has(item.id)
            return (
              <TouchableOpacity style={bs.tile} onPress={() => onSelectExercise(item)} activeOpacity={0.8}>
                <View>
                  {(item.gif_url ?? item.image_url) ? (
                    <Image source={{ uri: item.gif_url ?? item.image_url ?? '' }} style={bs.tileImg} resizeMode="cover" />
                  ) : (
                    <View style={[bs.tileImg, bs.tileImgPlaceholder]}>
                      <Text style={{ fontSize: 32 }}>💪</Text>
                    </View>
                  )}
                  <TouchableOpacity
                    style={bs.favBtn}
                    onPress={(e) => { e.stopPropagation(); toggleFavorite(item.id) }}
                    hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                  >
                    <Text style={[bs.favIcon, fav && bs.favIconActive]}>{fav ? '★' : '☆'}</Text>
                  </TouchableOpacity>
                </View>
                <View style={bs.tileMeta}>
                  <Text style={bs.tileName} numberOfLines={2}>{item.name_ko}</Text>
                  <Text style={bs.tileEquip}>{EQUIPMENT_KO[item.equipment] ?? item.equipment}</Text>
                </View>
              </TouchableOpacity>
            )
          }}
          ListEmptyComponent={<Text style={bs.empty}>운동 목록이 없어요</Text>}
        />
      </View>
    </Modal>
  )
}

const bs = StyleSheet.create({
  backdrop:          { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet:             { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 12, paddingBottom: 40, maxHeight: '85%' },
  handle:            { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.borderSoft, alignSelf: 'center', marginBottom: 14 },
  header:            { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 12 },
  title:             { fontSize: 17, fontWeight: '700', color: colors.textPrimary },
  close:             { fontSize: 18, color: colors.textTertiary },
  search:            { marginHorizontal: 20, backgroundColor: colors.background, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: colors.textPrimary, fontSize: 14, marginBottom: 10 },
  filterScroll:      { flexShrink: 0, marginBottom: 14 },
  filterRow:         { paddingHorizontal: 20, gap: 8 },
  filterChip:        { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.borderSoft },
  filterChipActive:  { backgroundColor: colors.mint, borderColor: colors.mint },
  filterChipTxt:     { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  filterChipTxtActive: { color: '#fff' },
  gridContent:       { paddingHorizontal: 20, paddingBottom: 20 },
  gridRow:           { gap: 10, marginBottom: 10 },
  tile:              { width: TILE_SIZE, backgroundColor: colors.background, borderRadius: 14, overflow: 'hidden' },
  tileImg:           { width: '100%', height: TILE_SIZE * 0.7 },
  tileImgPlaceholder:{ backgroundColor: colors.borderSoft, alignItems: 'center', justifyContent: 'center' },
  tileMeta:          { padding: 10, gap: 3 },
  tileName:          { fontSize: 13, fontWeight: '600', color: colors.textPrimary, lineHeight: 17 },
  tileEquip:         { fontSize: 11, color: colors.textTertiary, fontWeight: '500' },
  favBtn:            { position: 'absolute', top: 6, right: 6, backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 14, width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  favIcon:           { fontSize: 15, color: 'rgba(255,255,255,0.6)' },
  favIconActive:     { color: '#FFD700' },
  empty:             { color: colors.textTertiary, textAlign: 'center', padding: 32, width: '100%' },
})

// ─── 소요 시간 추정 ───────────────────────────────────────────────────────────

function estimateDuration(items: PrescribedExercise[], restSeconds: number): string {
  const totalSets = items.reduce((sum, p) => sum + p.sets, 0)
  const totalSec = totalSets * (40 + restSeconds) + items.length * 30
  return `약 ${Math.round(totalSec / 60)}분`
}

// ─── 오늘의 루틴 탭 (briefing 스타일) ────────────────────────────────────────

function RoutineTab({
  prescribed,
  todayMuscles,
  donePrescribedIds,
  todayLogs,
  isDeload,
  currentWeek,
  muscleSetMap,
  restSeconds,
  proteinLow,
  onPrescribedPress,
  onAddExtraPress,
  onStartWorkout,
  onGoDiet,
}: {
  prescribed: PrescribedExercise[]
  todayMuscles: MuscleGroup[]
  donePrescribedIds: Set<string>
  todayLogs: ExerciseLog[]
  isDeload: boolean
  currentWeek: number
  muscleSetMap: Partial<Record<MuscleGroup, number>>
  restSeconds: number
  proteinLow: boolean
  onPrescribedPress: (p: PrescribedExercise) => void
  onAddExtraPress: () => void
  onStartWorkout: () => void
  onGoDiet: () => void
}) {
  const insets = useSafeAreaInsets()
  const donePrescribed = prescribed.filter((p) => donePrescribedIds.has(p.exerciseId)).length
  const allDone = prescribed.length > 0 && donePrescribed === prescribed.length
  const isRest = prescribed.length === 0
  const totalSets = prescribed.reduce((sum, p) => sum + p.sets, 0)
  const duration = estimateDuration(prescribed, restSeconds)

  return (
    <View style={{ flex: 1, paddingHorizontal: 20 }}>

      {isRest ? (
        <View style={[s.emptyRoutine, { flex: 1 }]}>
          <Text style={s.emptyRoutineEmoji}>😴</Text>
          <Text style={s.emptyRoutineTitle}>오늘은 휴식일이에요</Text>
          <Text style={s.emptyRoutineSub}>충분한 휴식이 근육 회복을 도와요</Text>
        </View>
      ) : (
        <>
          {/* 딜로드 배너 */}
          {isDeload && (
            <View style={[s.deloadBanner, { marginTop: 4 }]}>
              <Text style={s.deloadEmoji}>🔁</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.deloadTitle}>{currentWeek}주차 — 딜로드 주</Text>
                <Text style={s.deloadSub}>볼륨을 절반으로 줄여 몸을 회복시켜요. 다음 주 더 강하게!</Text>
              </View>
            </View>
          )}

          {/* 단백질 부족 배너 */}
          {proteinLow && !isDeload && (
            <View style={[s.proteinLowBanner, { marginTop: 4 }]}>
              <Text style={s.deloadEmoji}>🥩</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.proteinLowTitle}>단백질 부족 — 볼륨 조정됨</Text>
                <Text style={s.proteinLowSub}>최근 3일 단백질이 부족해서 볼륨을 약간 줄였어요.</Text>
              </View>
            </View>
          )}

          {/* 오늘 부위 + 메타 뱃지 */}
          <Text style={[s.briefMuscles, { marginTop: isDeload || proteinLow ? 0 : 4 }]}>
            {todayMuscles.map((m) => MUSCLE_KO[m] ?? m).join(' · ')}
          </Text>
          <View style={s.briefMetaRow}>
            <View style={s.briefMetaBadge}>
              <Text style={s.briefMetaIcon}>⏱</Text>
              <Text style={s.briefMetaTxt}>{duration}</Text>
            </View>
            <View style={s.briefMetaBadge}>
              <Text style={s.briefMetaIcon}>🏋️</Text>
              <Text style={s.briefMetaTxt}>{prescribed.length}가지 운동 · {totalSets}세트</Text>
            </View>
            <View style={s.briefMetaBadge}>
              <Text style={s.briefMetaIcon}>😴</Text>
              <Text style={s.briefMetaTxt}>세트 사이 {restSeconds}초 휴식</Text>
            </View>
          </View>

          {/* 운동 카드 목록 — 내부 스크롤 박스 */}
          {allDone ? (
            <View style={s.allDoneWrap}>
              <View style={s.allDoneBanner}>
                <Text style={s.allDoneEmoji}>🔥</Text>
                <Text style={s.allDoneText}>오늘 루틴 완료! 대단해요</Text>
              </View>
              <TouchableOpacity style={s.allDoneDietBtn} onPress={onGoDiet} activeOpacity={0.85}>
                <Text style={s.allDoneDietBtnText}>🥩 단백질 지금 챙기러 가기 →</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <ScrollView
              style={s.briefScrollBox}
              contentContainerStyle={s.briefScrollContent}
              showsVerticalScrollIndicator
              persistentScrollbar
              indicatorStyle="white"
            >
              {prescribed.map((p, i) => {
                const done = donePrescribedIds.has(p.exerciseId)
                const ex = exercises.find((e) => e.id === p.exerciseId)
                const prog = (p as any).progression
                const badge =
                  prog === 'weight_up'   ? { label: '↑ 무게 UP', color: '#34C759' } :
                  prog === 'sets_up'     ? { label: '+ 세트 UP', color: '#007AFF' } :
                  prog === 'weight_down' ? { label: '↓ 조정',    color: '#FF9500' } : null

                return (
                  <TouchableOpacity
                    key={p.exerciseId}
                    style={[s.briefCard, done && s.briefCardDone]}
                    onPress={() => !done && onPrescribedPress(p)}
                    activeOpacity={done ? 1 : 0.75}
                  >
                    <View style={[s.briefCardNum, done && { backgroundColor: colors.mint }]}>
                      {done
                        ? <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>✓</Text>
                        : <Text style={s.briefCardNumTxt}>{i + 1}</Text>
                      }
                    </View>
                    {ex?.gif_url ?? ex?.image_url ? (
                      <Image
                        source={{ uri: ex.gif_url ?? ex.image_url ?? '' }}
                        style={[s.briefImg, done && { opacity: 0.4 }]}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={[s.briefImg, s.briefImgPlaceholder]}>
                        <Text style={{ fontSize: 22 }}>💪</Text>
                      </View>
                    )}
                    <View style={s.briefCardBody}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <Text style={[s.briefExName, done && { color: colors.textTertiary }]} numberOfLines={1}>
                          {ex?.name_ko ?? p.exerciseId}
                        </Text>
                        {badge && !done && (
                          <View style={[s.briefProgBadge, { backgroundColor: badge.color + '22', borderColor: badge.color + '55' }]}>
                            <Text style={[s.briefProgBadgeTxt, { color: badge.color }]}>{badge.label}</Text>
                          </View>
                        )}
                      </View>
                      <Text style={s.briefExMeta}>
                        {MUSCLE_KO[p.muscleGroup] ?? p.muscleGroup} · {p.sets}세트 × {p.targetReps}회
                      </Text>
                      {p.suggestedWeightKg != null && !done && (
                        <Text style={s.briefExWeight}>{p.suggestedWeightKg}kg 예정</Text>
                      )}
                    </View>
                    {!done && <Text style={s.prescribeArrow}>›</Text>}
                  </TouchableOpacity>
                )
              })}
            </ScrollView>
          )}

          {/* 운동 시작 버튼 — 하단 고정 */}
          {!allDone && (
            <TouchableOpacity
              style={[s.startWorkoutBtn, { marginTop: 12, marginBottom: Math.max(insets.bottom, 16) + 72 }]}
              onPress={onStartWorkout}
              activeOpacity={0.85}
            >
              <Text style={s.startWorkoutTxt}>
                {donePrescribed > 0 ? `이어서 운동하기 (${donePrescribed}/${prescribed.length})` : '운동 시작 →'}
              </Text>
            </TouchableOpacity>
          )}
        </>
      )}

      {/* 오늘 자극 부위 heatmap — 휴식일에만 표시 */}
      {isRest && Object.keys(muscleSetMap).length > 0 && (
        <View style={s.heatmapCard}>
          <Text style={s.heatmapTitle}>오늘 자극한 근육</Text>
          <MuscleHeatmap muscleSetMap={muscleSetMap} scale={1.2} showToggle />
        </View>
      )}
    </View>
  )
}

// ─── 수동입력 모달 (기존 RoutineTab 내용) ─────────────────────────────────────

function ManualLogModal({
  visible,
  onClose,
  prescribed,
  todayMuscles,
  donePrescribedIds,
  todayLogs,
  onSave,
  onAddExtraPress,
}: {
  visible: boolean
  onClose: () => void
  prescribed: PrescribedExercise[]
  todayMuscles: MuscleGroup[]
  donePrescribedIds: Set<string>
  todayLogs: ExerciseLog[]
  onSave: (ex: Exercise, sets: ExerciseSet[], suggested?: number | null) => void
  onAddExtraPress: () => void
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [setMap, setSetMap] = useState<Record<string, ExerciseSet[]>>({})

  const donePrescribed = prescribed.filter((p) => donePrescribedIds.has(p.exerciseId)).length

  const getOrInitSets = (p: PrescribedExercise): ExerciseSet[] => {
    if (setMap[p.exerciseId]) return setMap[p.exerciseId]
    return [{ set_number: 1, reps: undefined, weight_kg: p.suggestedWeightKg ?? undefined }]
  }

  const updateSets = (exerciseId: string, updated: ExerciseSet[]) =>
    setSetMap((prev) => ({ ...prev, [exerciseId]: updated }))

  const handleToggle = (p: PrescribedExercise) => {
    if (donePrescribedIds.has(p.exerciseId)) return
    setExpandedId((prev) => (prev === p.exerciseId ? null : p.exerciseId))
    if (!setMap[p.exerciseId]) {
      setSetMap((prev) => ({
        ...prev,
        [p.exerciseId]: [{ set_number: 1, reps: undefined, weight_kg: p.suggestedWeightKg ?? undefined }],
      }))
    }
  }

  const handleSave = (p: PrescribedExercise) => {
    const ex = exercises.find((e) => e.id === p.exerciseId)
    if (!ex) return
    const sets = getOrInitSets(p)
    const valid = sets.filter((item) => item.reps != null && item.reps > 0)
    if (valid.length === 0) return
    onSave(ex, valid, p.suggestedWeightKg)
    setExpandedId(null)
    setSetMap((prev) => { const n = { ...prev }; delete n[p.exerciseId]; return n })
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <TouchableOpacity style={ml.backdrop} activeOpacity={1} onPress={onClose} />
      <View style={ml.sheet}>
        <View style={ml.handle} />

        {/* 헤더 */}
        <View style={ml.header}>
          <View>
            <Text style={ml.title}>수동 기록</Text>
            {todayMuscles.length > 0 && (
              <Text style={ml.subtitle}>{todayMuscles.map((m) => MUSCLE_KO[m] ?? m).join(' · ')}</Text>
            )}
          </View>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={ml.close}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* 진행률 바 */}
        {prescribed.length > 0 && (
          <View style={ml.progressWrap}>
            <View style={ml.progressTrack}>
              <View style={[ml.progressFill, { width: `${(donePrescribed / prescribed.length) * 100}%` }]} />
            </View>
            <Text style={ml.progressTxt}>{donePrescribed}/{prescribed.length}</Text>
          </View>
        )}

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={ml.body} keyboardShouldPersistTaps="handled">
          {prescribed.length === 0 ? (
            <View style={ml.empty}>
              <Text style={ml.emptyEmoji}>🗓</Text>
              <Text style={ml.emptyTitle}>오늘은 휴식일이에요</Text>
              <Text style={ml.emptySub}>탐색 탭에서 운동을 직접 선택하세요</Text>
            </View>
          ) : (
            <View style={ml.list}>
              {prescribed.map((p) => {
                const done = donePrescribedIds.has(p.exerciseId)
                const ex = exercises.find((e) => e.id === p.exerciseId)
                const log = todayLogs.find((l) => l.exercise.id === p.exerciseId)
                const bestSet = log?.sets?.reduce((best, cur) =>
                  (cur.weight_kg ?? 0) > (best.weight_kg ?? 0) ? cur : best
                , log.sets[0])
                const expanded = expandedId === p.exerciseId
                const sets = getOrInitSets(p)

                return (
                  <View key={p.exerciseId} style={[ml.item, done && ml.itemDone, expanded && ml.itemExpanded]}>
                    {/* 카드 헤더 */}
                    <TouchableOpacity
                      style={ml.itemRow}
                      onPress={() => handleToggle(p)}
                      activeOpacity={done ? 1 : 0.75}
                    >
                      <View style={[ml.dot, done && ml.dotDone]}>
                        {done && <Text style={ml.dotCheck}>✓</Text>}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[ml.itemName, done && ml.itemNameDone]} numberOfLines={1}>
                          {ex?.name_ko ?? p.exerciseId}
                        </Text>
                        <Text style={ml.itemMeta}>
                          {MUSCLE_KO[p.muscleGroup] ?? p.muscleGroup} · {p.sets}세트 × {p.targetReps}회
                          {done && bestSet?.weight_kg != null ? `  ·  최고 ${bestSet.weight_kg}kg` : ''}
                        </Text>
                      </View>
                      {!done && (
                        <Text style={[ml.arrow, expanded && ml.arrowDown]}>›</Text>
                      )}
                      {done && log?.sets?.length ? (
                        <View style={ml.doneBadge}>
                          <Text style={ml.doneBadgeTxt}>{log.sets.length}세트</Text>
                        </View>
                      ) : null}
                    </TouchableOpacity>

                    {/* 아코디언 — 세트 입력 */}
                    {expanded && (
                      <View style={ml.accordion}>
                        {/* overload 힌트 */}
                        {p.suggestedWeightKg != null && (
                          <View style={ml.overloadBanner}>
                            <Text style={ml.overloadTxt}>🔥 목표 중량 <Text style={{ fontWeight: '800' }}>{p.suggestedWeightKg}kg</Text></Text>
                          </View>
                        )}

                        {/* 세트 헤더 */}
                        <View style={ml.setHeader}>
                          <Text style={[ml.setHeaderCell, ml.colNum]}>세트</Text>
                          <Text style={[ml.setHeaderCell, ml.colFlex]}>무게 (kg)</Text>
                          <View style={ml.colX} />
                          <Text style={[ml.setHeaderCell, ml.colFlex]}>횟수</Text>
                          <View style={{ width: 28 }} />
                        </View>

                        {sets.map((set, i) => (
                          <SetRow
                            key={i}
                            index={i}
                            set={set}
                            onChange={(updated) => {
                              const next = sets.map((s, idx) => idx === i ? updated : s)
                              updateSets(p.exerciseId, next)
                            }}
                            onRemove={() => {
                              const next = sets.filter((_, idx) => idx !== i).map((s, idx) => ({ ...s, set_number: idx + 1 }))
                              updateSets(p.exerciseId, next)
                            }}
                          />
                        ))}

                        {/* 세트 추가 + 저장 */}
                        <View style={ml.accordionActions}>
                          <TouchableOpacity
                            style={ml.addSetBtn}
                            onPress={() => updateSets(p.exerciseId, [...sets, { set_number: sets.length + 1, reps: undefined, weight_kg: undefined }])}
                            activeOpacity={0.7}
                          >
                            <Text style={ml.addSetTxt}>+ 세트</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={ml.saveBtn} onPress={() => handleSave(p)} activeOpacity={0.85}>
                            <Text style={ml.saveTxt}>기록 저장</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    )}
                  </View>
                )
              })}
            </View>
          )}

          {/* 추가 운동 버튼 */}
          <TouchableOpacity style={ml.addBtn} onPress={() => { onAddExtraPress(); onClose() }} activeOpacity={0.8}>
            <Text style={ml.addTxt}>+ 운동 추가하기</Text>
          </TouchableOpacity>

          {/* 추가 운동 로그 */}
          {todayLogs.filter((l) => !prescribed.some((p) => p.exerciseId === l.exercise.id)).length > 0 && (
            <View style={ml.extraSection}>
              <Text style={ml.extraLabel}>추가 운동</Text>
              {todayLogs
                .filter((l) => !prescribed.some((p) => p.exerciseId === l.exercise.id))
                .map((log) => (
                  <View key={log.id} style={ml.extraItem}>
                    <Text style={ml.extraName}>{log.exercise.name_ko}</Text>
                    <Text style={ml.extraSets}>
                      {log.sets?.length ?? 0}세트
                      {log.sets?.[0]?.weight_kg != null ? ` · ${log.sets[0].weight_kg}kg` : ''}
                    </Text>
                  </View>
                ))}
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  )
}

const ml = StyleSheet.create({
  backdrop:      { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet:         { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 12, maxHeight: '88%' },
  handle:        { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.borderSoft, alignSelf: 'center', marginBottom: 14 },
  header:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: colors.borderSoft },
  title:         { fontSize: 18, fontWeight: '700', color: colors.textPrimary, letterSpacing: -0.3 },
  subtitle:      { fontSize: 12, fontWeight: '500', color: colors.textTertiary, marginTop: 3 },
  close:         { fontSize: 18, color: colors.textTertiary },
  progressWrap:  { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.borderSoft },
  progressTrack: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.borderSoft, overflow: 'hidden' },
  progressFill:  { height: '100%', borderRadius: 2, backgroundColor: colors.mint },
  progressTxt:   { fontSize: 12, fontWeight: '600', color: colors.textTertiary, width: 32, textAlign: 'right' },
  body:          { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 32 },
  empty:         { alignItems: 'center', paddingVertical: 36, gap: 8 },
  emptyEmoji:    { fontSize: 36 },
  emptyTitle:    { fontSize: 16, fontWeight: '600', color: colors.textPrimary },
  emptySub:      { fontSize: 13, color: colors.textTertiary, textAlign: 'center' },
  list:              { gap: 8, marginBottom: 16 },
  item:              { backgroundColor: colors.background, borderRadius: 14, borderWidth: 1.5, borderColor: colors.mint, overflow: 'hidden' },
  itemDone:          { borderColor: colors.borderSoft },
  itemExpanded:      { borderColor: colors.mint },
  itemRow:           { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  dot:               { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: colors.mint, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  dotDone:           { backgroundColor: colors.mint, borderColor: colors.mint },
  dotCheck:          { color: '#fff', fontSize: 12, fontWeight: '700' },
  itemName:          { fontSize: 15, fontWeight: '600', color: colors.textPrimary, marginBottom: 3 },
  itemNameDone:      { color: colors.textTertiary },
  itemMeta:          { fontSize: 12, color: colors.textTertiary, fontWeight: '500' },
  arrow:             { fontSize: 20, color: colors.mint, fontWeight: '600' },
  arrowDown:         { transform: [{ rotate: '90deg' }] },
  doneBadge:         { backgroundColor: `${colors.mint}20`, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 4 },
  doneBadgeTxt:      { fontSize: 12, fontWeight: '700', color: colors.mint },
  accordion:         { borderTopWidth: 1, borderTopColor: colors.borderSoft, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 14 },
  overloadBanner:    { flexDirection: 'row', alignItems: 'center', backgroundColor: `${colors.mint}15`, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12, marginBottom: 12, borderWidth: 1, borderColor: `${colors.mint}35` },
  overloadTxt:       { fontSize: 12, color: colors.mint, flex: 1 },
  setHeader:         { flexDirection: 'row', alignItems: 'center', marginBottom: 8, paddingHorizontal: 2 },
  setHeaderCell:     { color: colors.textTertiary, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  colNum:            { width: 24, textAlign: 'center' },
  colFlex:           { flex: 1, textAlign: 'center' },
  colX:              { width: 18 },
  accordionActions:  { flexDirection: 'row', gap: 8, marginTop: 12 },
  addSetBtn:         { flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: 10, borderWidth: 1.5, borderColor: colors.borderSoft, borderStyle: 'dashed' },
  addSetTxt:         { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  saveBtn:           { flex: 2, backgroundColor: colors.mint, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingVertical: 11 },
  saveTxt:           { color: '#fff', fontSize: 14, fontWeight: '700' },
  addBtn:            { borderRadius: 12, paddingVertical: 14, alignItems: 'center', borderWidth: 1.5, borderColor: colors.borderSoft, borderStyle: 'dashed', marginBottom: 24 },
  addTxt:            { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
  extraSection:      { gap: 8 },
  extraLabel:        { fontSize: 11, fontWeight: '700', color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  extraItem:         { backgroundColor: colors.background, borderRadius: 12, padding: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  extraName:         { fontSize: 14, fontWeight: '500', color: colors.textPrimary },
  extraSets:         { fontSize: 13, fontWeight: '600', color: colors.mint },
})

// ─── 탐색 탭 ──────────────────────────────────────────────────────────────────

function ExploreTab({
  todayLogs,
  onMuscleSelect,
}: {
  todayLogs: ExerciseLog[]
  onMuscleSelect: (m: MuscleGroup) => void
}) {
  const [selectedMuscle, setSelectedMuscle] = useState<MuscleGroup | null>(null)

  const muscleSetMap = useMemo(() => {
    const map: Partial<Record<MuscleGroup, number>> = {}
    for (const log of todayLogs) {
      const sets = log.sets?.length ?? 0
      for (const m of log.exercise.primary_muscles as MuscleGroup[]) {
        map[m] = (map[m] ?? 0) + sets
      }
      for (const m of log.exercise.secondary_muscles as MuscleGroup[]) {
        map[m] = (map[m] ?? 0) + Math.floor(sets * 0.5)
      }
    }
    return map
  }, [todayLogs])

  const trainedMuscles = Object.keys(muscleSetMap) as MuscleGroup[]

  const handleMusclePress = (m: MuscleGroup) => {
    setSelectedMuscle(m)
    onMuscleSelect(m)
  }

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={s.tabContent}
      showsVerticalScrollIndicator={false}
    >
      <Text style={s.exploreHint}>근육 부위를 터치해서 운동을 선택하세요</Text>

      <MuscleHeatmap
        muscleSetMap={muscleSetMap}
        onMusclePress={handleMusclePress}
        selectedMuscle={selectedMuscle}
        scale={1.4}
        showToggle
      />

      {/* 오늘 자극한 근육 태그 */}
      {trainedMuscles.length > 0 && (
        <View style={s.highlightRow}>
          <Text style={s.highlightLabel}>오늘 자극한 부위</Text>
          <View style={s.highlightTags}>
            {trainedMuscles.map((m) => (
              <View key={m} style={s.highlightTag}>
                <Text style={s.highlightTagTxt}>{MUSCLE_KO[m] ?? m}</Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </ScrollView>
  )
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function ExerciseScreen() {
  const router = useRouter()
  const { bodyInfo, programStartedAt } = useAuthStore()
  const { addLog, getTodayLogs, getLastSetForExercise, logs: allLogs } = useExerciseLogStore()
  const { replacedExerciseIds } = useExerciseStore()
  const { logs: allMealLogs } = useDietStore()

  const [activeTab, setActiveTab] = useState<'routine' | 'explore'>('routine')
  const [selectedMuscle, setSelectedMuscle] = useState<MuscleGroup | null>(null)
  const [selectedExercise, setSelectedExercise] = useState<Exercise | null>(null)
  const [detailExercise, setDetailExercise] = useState<{ ex: Exercise; suggested?: number | null } | null>(null)
  const [lastWeight, setLastWeight] = useState<number | null>(null)
  const [suggestedWeight, setSuggestedWeight] = useState<number | null>(null)
  const [manualLogVisible, setManualLogVisible] = useState(false)

  const today = getTodayString()
  const todayLogs = getTodayLogs(today)
  const todaySets = todayLogs.reduce((sum, l) => sum + (l.sets?.length ?? 0), 0)
  const donePrescribedIds = new Set(todayLogs.map((l) => l.exercise.id))
  // 오늘 세션 기록이 있으면 완료로 간주 → 다음 스플릿 일차 표시
  const completedToday = todayLogs.some((l) => l.sets && l.sets.length > 0)

  const buildInfo = bodyInfo as BuildBodyInfo | null
  const buildGoals = buildInfo
    ? calculateBuildGoals(buildInfo, programStartedAt ?? today, todaySets, completedToday)
    : null

  const deload = programStartedAt ? getDeloadStatus(programStartedAt) : null

  // exercise별 지난 세션 최고 무게 + 최악 RPE + 세트 수 (workout/index.tsx와 동일한 로직)
  const RPE_RANK: Record<string, number> = { easy: 0, moderate: 1, hard: 2, max: 3 }
  const { lastWeightsMap, lastRpesMap, lastSetsCountMap } = useMemo(() => {
    const weights: Record<string, number | null> = {}
    const rpes: Record<string, string | null> = {}
    const setCounts: Record<string, number> = {}
    const sorted = [...allLogs].sort((a, b) => (a.created_at > b.created_at ? -1 : 1))
    sorted.forEach((l) => {
      if (!l.sets || l.sets.length === 0) return
      const exId = l.exercise.id
      if (weights[exId] !== undefined) return
      const maxW = Math.max(...l.sets.map((s) => s.weight_kg ?? 0))
      weights[exId] = maxW > 0 ? maxW : null
      const worstRpe = l.sets.reduce<string | null>((worst, cur) => {
        if (!cur.rpe) return worst
        if (!worst) return cur.rpe
        return (RPE_RANK[cur.rpe] ?? 0) > (RPE_RANK[worst] ?? 0) ? cur.rpe : worst
      }, null)
      rpes[exId] = worstRpe
      setCounts[exId] = l.sets.length
    })
    return { lastWeightsMap: weights, lastRpesMap: rpes, lastSetsCountMap: setCounts }
  }, [allLogs])

  const recentWeekSessionCounts = useMemo<[number, number, number]>(() => {
    const counts: [number, number, number] = [0, 0, 0]
    const sessionDates = new Set(
      allLogs.filter((l) => l.sets && l.sets.length > 0).map((l) => l.date)
    )
    sessionDates.forEach((dateStr) => {
      const d = new Date(dateStr)
      const now = new Date(); now.setHours(0, 0, 0, 0)
      const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000)
      if (diffDays >= 0 && diffDays < 7)        counts[0]++
      else if (diffDays >= 7 && diffDays < 14)  counts[1]++
      else if (diffDays >= 14 && diffDays < 21) counts[2]++
    })
    return counts
  }, [allLogs])

  const completedSessionCount = useMemo(() =>
    allLogs.filter((l) => l.sets && l.sets.length > 0).length
  , [allLogs])

  const proteinRatioLast3Days = useMemo(() => {
    if (!buildInfo) return 1
    const proteinGoal = buildInfo.weight * (
      (buildInfo as any).experience_level === 'advanced' ? 2.2
      : (buildInfo as any).experience_level === 'intermediate' ? 2.0 : 1.6
    )
    const ratios: number[] = []
    for (let d = 1; d <= 3; d++) {
      const dt = new Date(); dt.setDate(dt.getDate() - d)
      const dateStr = dt.toLocaleDateString('en-CA')
      const dayProtein = allMealLogs
        .filter((l) => ((l as any).date ?? new Date(l.created_at).toLocaleDateString('en-CA')) === dateStr)
        .reduce((s, l) => s + l.total_nutrition.protein, 0)
      ratios.push(Math.min(1, dayProtein / proteinGoal))
    }
    return ratios.reduce((a, b) => a + b, 0) / ratios.length
  }, [allMealLogs, buildInfo])

  const prescribed: PrescribedExercise[] = useMemo(() => {
    if (!buildInfo || !buildGoals?.todayMuscleGroups.length) return []
    return prescribeRoutine(
      buildInfo,
      buildGoals.todayMuscleGroups,
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
  }, [buildInfo, buildGoals?.todayMuscleGroups.join(','), programStartedAt, lastWeightsMap, lastRpesMap, lastSetsCountMap, replacedExerciseIds, completedSessionCount, proteinRatioLast3Days, recentWeekSessionCounts])

  // 오늘 로그 → 근육별 세트 수 (primary 100% + secondary 50%)
  const todayMuscleSetMap = useMemo<Partial<Record<MuscleGroup, number>>>(() => {
    const map: Partial<Record<MuscleGroup, number>> = {}
    for (const log of todayLogs) {
      const sets = log.sets?.length ?? 0
      for (const m of log.exercise.primary_muscles as MuscleGroup[]) {
        map[m] = (map[m] ?? 0) + sets
      }
      for (const m of log.exercise.secondary_muscles as MuscleGroup[]) {
        map[m] = (map[m] ?? 0) + Math.floor(sets * 0.5)
      }
    }
    return map
  }, [todayLogs])

  const handleMuscleSelect = (muscle: MuscleGroup) => {
    setSelectedMuscle(muscle)
  }

  const handleExerciseSelect = (ex: Exercise, suggested?: number | null) => {
    setSelectedMuscle(null)
    setDetailExercise({ ex, suggested })
  }

  const handlePrescribedPress = (p: PrescribedExercise) => {
    const ex = exercises.find((e) => e.id === p.exerciseId)
    if (!ex) return
    setDetailExercise({ ex, suggested: p.suggestedWeightKg })
  }

  const handlePrescribedPressDirectLog = (p: PrescribedExercise) => {
    const ex = exercises.find((e) => e.id === p.exerciseId)
    if (!ex) return
    const last = getLastSetForExercise(ex.id)
    setLastWeight(last?.weight_kg ?? null)
    setSuggestedWeight(p.suggestedWeightKg ?? null)
    setSelectedExercise(ex)
  }

  const handleStartLogFromDetail = () => {
    if (!detailExercise) return
    const { ex, suggested } = detailExercise
    setDetailExercise(null)
    const last = getLastSetForExercise(ex.id)
    setLastWeight(last?.weight_kg ?? null)
    setSuggestedWeight(suggested ?? null)
    setSelectedExercise(ex)
  }

  const handleAddExtra = () => {
    setActiveTab('explore')
  }

  const handleSaveSets = (sets: ExerciseSet[]) => {
    if (!selectedExercise || !bodyInfo) { setSelectedExercise(null); return }
    const totalVol = sets.reduce((sum, item) => sum + (item.weight_kg ?? 0) * (item.reps ?? 0), 0)
    addLog({
      id: Date.now().toString(),
      user_id: bodyInfo.user_id,
      date: today,
      exercise: selectedExercise,
      sets,
      calories_burned: Math.round(totalVol * 0.05),
      created_at: new Date().toISOString(),
    })
    setSelectedExercise(null)
    setLastWeight(null)
    setSuggestedWeight(null)
  }

  const todayMuscles = (buildGoals?.todayMuscleGroups ?? []) as MuscleGroup[]

  return (
    <SafeAreaView style={s.screen}>
      {/* 헤더 */}
      <View style={s.header}>
        <Text style={s.title}>운동</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {todaySets > 0 && (
            <View style={s.badge}>
              <Text style={s.badgeTxt}>{todaySets}세트 완료</Text>
            </View>
          )}
          {activeTab === 'routine' && (
            <TouchableOpacity
              style={s.manualBtn}
              onPress={() => setManualLogVisible(true)}
              activeOpacity={0.75}
            >
              <Text style={s.manualBtnTxt}>수동입력</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* 세그먼트 탭 */}
      <View style={s.segmentWrap}>
        <TouchableOpacity
          style={[s.segmentBtn, activeTab === 'routine' && s.segmentBtnActive]}
          onPress={() => setActiveTab('routine')}
          activeOpacity={0.8}
        >
          <Text style={[s.segmentTxt, activeTab === 'routine' && s.segmentTxtActive]}>
            오늘의 루틴
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.segmentBtn, activeTab === 'explore' && s.segmentBtnActive]}
          onPress={() => setActiveTab('explore')}
          activeOpacity={0.8}
        >
          <Text style={[s.segmentTxt, activeTab === 'explore' && s.segmentTxtActive]}>
            탐색
          </Text>
        </TouchableOpacity>
      </View>

      {/* 탭 콘텐츠 */}
      {activeTab === 'routine' ? (
        <RoutineTab
          prescribed={prescribed}
          todayMuscles={todayMuscles}
          donePrescribedIds={donePrescribedIds}
          todayLogs={todayLogs}
          isDeload={deload?.isDeload ?? false}
          currentWeek={deload?.currentWeek ?? 1}
          muscleSetMap={todayMuscleSetMap}
          restSeconds={buildInfo?.build_goal === 'bulk' ? 90 : buildInfo?.build_goal === 'cut' ? 60 : 75}
          proteinLow={(proteinRatioLast3Days ?? 1) < 0.70}
          onPrescribedPress={handlePrescribedPress}
          onAddExtraPress={handleAddExtra}
          onStartWorkout={() => router.push({ pathname: '/workout', params: { muscles: todayMuscles.join(',') } })}
          onGoDiet={() => router.push('/(tabs)/diet')}
        />
      ) : (
        <ExploreTab
          todayLogs={todayLogs}
          onMuscleSelect={handleMuscleSelect}
        />
      )}

      {/* 운동 목록 바텀시트 */}
      {selectedMuscle && !detailExercise && !selectedExercise && (
        <ExerciseBottomSheet
          muscle={selectedMuscle}
          onClose={() => setSelectedMuscle(null)}
          onSelectExercise={handleExerciseSelect}
        />
      )}

      {/* 운동 상세 모달 */}
      {detailExercise && (
        <ExerciseDetailModal
          exercise={detailExercise.ex}
          onClose={() => setDetailExercise(null)}
          onStartLog={handleStartLogFromDetail}
        />
      )}

      {/* 세트 기록 모달 */}
      {selectedExercise && (
        <SetLoggerModal
          exercise={selectedExercise}
          initialWeight={lastWeight}
          suggestedWeight={suggestedWeight}
          onClose={() => { setSelectedExercise(null); setLastWeight(null); setSuggestedWeight(null) }}
          onSave={handleSaveSets}
        />
      )}

      {/* 수동입력 모달 */}
      <ManualLogModal
        visible={manualLogVisible}
        onClose={() => setManualLogVisible(false)}
        prescribed={prescribed}
        todayMuscles={todayMuscles}
        donePrescribedIds={donePrescribedIds}
        todayLogs={todayLogs}
        onSave={(ex, sets, suggested) => {
          if (!bodyInfo) return
          const totalVol = sets.reduce((sum, item) => sum + (item.weight_kg ?? 0) * (item.reps ?? 0), 0)
          addLog({
            id: Date.now().toString(),
            user_id: bodyInfo.user_id,
            date: today,
            exercise: ex,
            sets,
            calories_burned: Math.round(totalVol * 0.05),
            created_at: new Date().toISOString(),
          })
        }}
        onAddExtraPress={handleAddExtra}
      />
    </SafeAreaView>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: -0.5,
  },
  badge: {
    backgroundColor: colors.mint,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  badgeTxt: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  manualBtn: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  manualBtnTxt: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  manualHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  manualTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  startWorkoutBtn: {
    backgroundColor: colors.mint,
    borderRadius: 16,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  startWorkoutTxt: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.3,
  },

  // ─── Segment ───────────────────────────────────────────────────────────────
  segmentWrap: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginBottom: 16,
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 3,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
    borderRadius: 10,
  },
  segmentBtnActive: {
    backgroundColor: colors.mint,
  },
  segmentTxt: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textTertiary,
  },
  segmentTxtActive: {
    color: '#fff',
  },

  // ─── Tab content ───────────────────────────────────────────────────────────
  tabContent: {
    paddingHorizontal: 20,
    paddingBottom: 120,
  },

  // ─── Routine Tab ───────────────────────────────────────────────────────────
  routineHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  routineMuscles: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: -0.3,
    marginBottom: 2,
  },
  routineSubtitle: {
    fontSize: 12,
    color: colors.textTertiary,
    fontWeight: '500',
  },
  totalSetsBadge: {
    backgroundColor: `${colors.mint}20`,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: `${colors.mint}40`,
  },
  totalSetsTxt: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.mint,
  },
  progressWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  progressTrack: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderSoft,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: colors.mint,
  },
  progressTxt: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textTertiary,
    width: 36,
    textAlign: 'right',
  },
  prescribeList: {
    gap: 10,
    marginBottom: 16,
  },
  prescribeCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1.5,
    borderColor: colors.mint,
  },
  prescribeCardDone: {
    borderColor: colors.borderSoft,
  },
  prescribeIndicator: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.mint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  prescribeIndicatorDone: {
    backgroundColor: colors.mint,
    borderColor: colors.mint,
  },
  prescribeCheck: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  prescribeName: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 3,
  },
  prescribeNameDone: {
    color: colors.textSecondary,
  },
  prescribeDetail: {
    color: colors.textTertiary,
    fontSize: 12,
  },
  prescribeArrow: {
    color: colors.mint,
    fontSize: 20,
    fontWeight: '600',
  },
  allDoneWrap: {
    gap: 10,
    marginTop: 8,
  },
  allDoneDietBtn: {
    backgroundColor: colors.mint,
    borderRadius: 14,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  allDoneDietBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  allDoneBanner: {
    backgroundColor: `${colors.mint}15`,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: `${colors.mint}30`,
  },
  allDoneEmoji: { fontSize: 22 },
  allDoneText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.mint,
  },
  emptyRoutine: {
    alignItems: 'center',
    paddingVertical: 48,
    gap: 8,
  },
  emptyRoutineEmoji: { fontSize: 40 },
  emptyRoutineTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  emptyRoutineSub: {
    fontSize: 13,
    color: colors.textTertiary,
    textAlign: 'center',
  },
  heatmapCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    alignItems: 'center',
    gap: 12,
  },
  heatmapTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
    alignSelf: 'flex-start',
  },
  addExtraBtn: {
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.borderSoft,
    borderStyle: 'dashed',
    marginBottom: 20,
  },
  addExtraTxt: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  extraHeader: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 8,
  },
  logCard: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  logName: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '500',
  },
  logSets: {
    color: colors.mint,
    fontSize: 13,
    fontWeight: '600',
  },

  // ─── Explore Tab ───────────────────────────────────────────────────────────
  exploreHint: {
    color: colors.textTertiary,
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 14,
  },
  sideToggle: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: 3,
    marginBottom: 16,
    alignSelf: 'center',
  },
  sideBtn: {
    paddingHorizontal: 32,
    paddingVertical: 8,
    borderRadius: 8,
  },
  sideBtnActive: { backgroundColor: colors.mint },
  sideTxt: { color: colors.textSecondary, fontSize: 14, fontWeight: '500' },
  sideTxtActive: { color: '#fff', fontWeight: '600' },
  mapWrap: {
    alignItems: 'center',
    marginBottom: 20,
  },
  highlightRow: {
    gap: 8,
  },
  highlightLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  highlightTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  highlightTag: {
    backgroundColor: `${colors.mint}20`,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: `${colors.mint}40`,
  },
  highlightTagTxt: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.mint,
  },

  // ─── Modal / BottomSheet ───────────────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  modalSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 40,
  },
  sheetPadded: {
    paddingHorizontal: 24,
  },
  filterRow: {
    height: 48,
    marginBottom: 4,
  },
  filterRowContent: {
    paddingHorizontal: 24,
    gap: 8,
    alignItems: 'center',
    height: 48,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderSoft,
    alignSelf: 'center',
    marginBottom: 16,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  modalSub: {
    fontSize: 13,
    color: colors.textTertiary,
    marginTop: 2,
    marginBottom: 16,
  },
  searchInput: {
    backgroundColor: colors.background,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.textPrimary,
    fontSize: 14,
    marginBottom: 12,
  },
  exItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  gridRow: {
    gap: 10,
    paddingHorizontal: 24,
  },
  gridContent: {
    gap: 10,
    paddingHorizontal: 0,
    paddingBottom: 16,
  },
  exGridItem: {
    flex: 1,
    backgroundColor: colors.background,
    borderRadius: 12,
    overflow: 'hidden',
  },
  exGridGif: {
    width: '100%',
    height: 120,
    backgroundColor: colors.borderSoft,
  },
  exGridGifPlaceholder: {
    backgroundColor: colors.borderSoft,
  },
  favBtn: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 14,
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  favIcon: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.6)',
  },
  favIconActive: {
    color: '#FFD700',
  },
  exGridInfo: {
    padding: 10,
  },
  exGridEquipment: {
    color: colors.mint,
    fontSize: 10,
    fontWeight: '700',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  exName: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  exSub: {
    color: colors.textTertiary,
    fontSize: 11,
    marginTop: 3,
  },
  sep: { height: 1, backgroundColor: colors.borderSoft },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  filterChipActive: {
    backgroundColor: colors.mint,
    borderColor: colors.mint,
  },
  filterChipText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '500',
  },
  filterChipTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  emptyTxt: {
    color: colors.textTertiary,
    textAlign: 'center',
    padding: 24,
  },

  // ─── Briefing Style ────────────────────────────────────────────────────────
  briefMuscles: {
    fontSize: 22, fontWeight: '800', color: colors.textPrimary,
    letterSpacing: -0.5, marginBottom: 12,
  },
  briefMetaRow:   { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  briefMetaBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.surface, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  briefMetaIcon:  { fontSize: 13 },
  briefMetaTxt:   { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
  briefList:      { gap: 10, marginBottom: 16 },
  briefScrollBox:    { flex: 1 },
  briefScrollContent: { gap: 8, paddingBottom: 4, paddingHorizontal: 4 },
  briefCard: {
    backgroundColor: colors.surface, borderRadius: 14,
    flexDirection: 'row', alignItems: 'center', overflow: 'hidden',
    borderWidth: 1.5, borderColor: colors.mint,
  },
  briefCardDone:   { borderColor: colors.borderSoft },
  briefCardNum: {
    width: 36, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 12, backgroundColor: 'transparent',
  },
  briefCardNumTxt: { fontSize: 13, fontWeight: '700', color: colors.textTertiary },
  briefImg:        { width: 72, height: 72 },
  briefImgPlaceholder: { backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  briefCardBody:   { flex: 1, paddingHorizontal: 12, paddingVertical: 12, gap: 3 },
  briefExName:     { fontSize: 14, fontWeight: '700', color: colors.textPrimary, letterSpacing: -0.2 },
  briefExMeta:     { fontSize: 12, color: colors.textTertiary },
  briefExWeight:   { fontSize: 12, fontWeight: '600', color: colors.mint },
  briefProgBadge:  { borderRadius: 6, borderWidth: 1, paddingHorizontal: 5, paddingVertical: 2 },
  briefProgBadgeTxt: { fontSize: 10, fontWeight: '700' },
  proteinLowBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: '#FF3B3015', borderRadius: 14, padding: 14,
    marginBottom: 12, borderWidth: 1, borderColor: '#FF3B3035',
  },
  proteinLowTitle: { fontSize: 13, fontWeight: '700', color: '#FF3B30', marginBottom: 2 },
  proteinLowSub:   { fontSize: 12, color: '#FF3B30CC', lineHeight: 17 },

  // ─── Deload Banner ─────────────────────────────────────────────────────────
  deloadBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF980015',
    borderRadius: 14,
    padding: 14,
    gap: 10,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#FF980035',
  },
  deloadEmoji: { fontSize: 22 },
  deloadTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FF9800',
    marginBottom: 2,
  },
  deloadSub: {
    fontSize: 12,
    color: '#FF9800CC',
    lineHeight: 16,
  },

  // ─── Overload Banner ────────────────────────────────────────────────────────
  overloadBanner: {
    backgroundColor: `${colors.mint}15`,
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: `${colors.mint}35`,
  },
  overloadTxt: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.mint,
    textAlign: 'center',
  },

  // ─── RPE Row ────────────────────────────────────────────────────────────────
  setRowWrap: {
    marginBottom: 10,
  },
  rpeRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 6,
    paddingLeft: 28,
  },
  rpeBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 5,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: 'transparent',
  },
  rpeTxt: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textTertiary,
  },

  // ─── Set Logger ────────────────────────────────────────────────────────────
  setHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  setHeaderCell: {
    color: colors.textTertiary,
    fontSize: 12,
    fontWeight: '600',
  },
  setColNum: { width: 20, textAlign: 'center' },
  setColFlex: { flex: 1, textAlign: 'center' },
  setColX: { width: 18 },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  setNum: {
    width: 20,
    color: colors.textTertiary,
    fontSize: 13,
    textAlign: 'center',
  },
  setInput: {
    flex: 1,
    backgroundColor: colors.background,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 8,
    color: colors.textPrimary,
    fontSize: 15,
    textAlign: 'center',
  },
  setX: { color: colors.textTertiary, fontSize: 14 },
  setRemove: { width: 28, alignItems: 'center' },
  addSetBtn: {
    alignItems: 'center',
    paddingVertical: 12,
    marginTop: 4,
  },
  addSetTxt: {
    color: colors.mint,
    fontSize: 14,
    fontWeight: '600',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  cancelBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 13,
    backgroundColor: colors.background,
    borderRadius: 12,
  },
  saveBtn: {
    flex: 2,
    alignItems: 'center',
    paddingVertical: 13,
    backgroundColor: colors.mint,
    borderRadius: 12,
  },
})

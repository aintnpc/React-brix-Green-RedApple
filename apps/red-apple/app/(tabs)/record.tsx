import React, { useState, useRef, useEffect } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Pressable,
  LayoutAnimation,
  Platform,
  UIManager,
  Dimensions,
  Animated,
  Modal,
  TextInput,
  Image,
  Alert,
} from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { Svg, Polyline as SvgPolyline, Circle, Line, Text as SvgText, Path, Defs, LinearGradient, Stop } from 'react-native-svg'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colorsDark as colors } from '@repo/theme'
import { getTodayString, calculateBuildGoals } from '@repo/shared'
import type { BuildBodyInfo, ExerciseLog, RPE, MuscleGroup } from '@repo/shared'
import { MuscleHeatmap } from '../../components/muscle/MuscleHeatmap'
import { useAuthStore } from '../../store/auth'
import { useDietStore } from '../../store/diet'
import { useExerciseLogStore } from '../../store/exerciseLog'
import { useWeightLogStore } from '../../store/weightLog'

if (Platform.OS === 'android') {
  UIManager.setLayoutAnimationEnabledExperimental?.(true)
}

const SW = Dimensions.get('window').width

// ─── Types ────────────────────────────────────────────────────────────────────

interface FoodEntry { name: string; protein: number }
interface MealEntry { type: string; label: string; emoji: string; foods: FoodEntry[]; totalProtein: number }

interface SetDetail {
  setNum: number
  weightKg: number
  reps: number
  rpe?: RPE
}
interface ExEntry {
  name: string
  sets: number
  maxWeightKg: number | null
  setDetails: SetDetail[]
  totalVolume: number        // Σ(weight × reps)
  estimated1RM: number | null  // Epley: w × (1 + reps/30), 세트 중 최고값
}
interface DayRecord {
  dayNum: number
  date: string
  dateStr: string  // YYYY-MM-DD
  weight?: number
  meals: MealEntry[]
  exercises: ExEntry[]
  isFuture: boolean
}

// D+1, 4, 7, 10, 13 ... 측정일 판별
function isMeasureDay(dayNum: number): boolean {
  return (dayNum - 1) % 3 === 0
}

// ─── Weight Chart ─────────────────────────────────────────────────────────────

const CHART_W = SW - 64
const CHART_H = 150
const PAD = { top: 20, bottom: 32, left: 38, right: 14 }

function WeightChart({ days, targetWeight }: { days: DayRecord[]; targetWeight: number }) {
  const { entries, getProgramDay } = useWeightLogStore()

  const today = getTodayString()
  const totalDays = Math.max(days.length, 1)

  // 측정일 데이터 포인트: weightLog entries에서 dayNum 계산
  const measurePoints = entries
    .filter((e) => isMeasureDay(getProgramDay(e.date)))
    .map((e) => ({ dayNum: getProgramDay(e.date), weight: e.weight }))

  if (measurePoints.length < 2) {
    return (
      <View style={chart.wrap}>
        <Text style={chart.title}>체중 변화</Text>
        <Text style={{ color: colors.textTertiary, fontSize: 13, textAlign: 'center', paddingVertical: 32 }}>
          측정 데이터가 부족해요 (2개 이상 필요)
        </Text>
      </View>
    )
  }

  const weights = measurePoints.map((p) => p.weight)
  const minW    = Math.min(...weights) - 0.5
  const maxW    = Math.max(...weights) + 0.3
  const innerW  = CHART_W - PAD.left - PAD.right
  const innerH  = CHART_H - PAD.top - PAD.bottom

  const xOf = (dayNum: number) => PAD.left + ((dayNum - 1) / (totalDays - 1)) * innerW
  const yOf = (w: number)      => PAD.top  + (1 - (w - minW) / (maxW - minW)) * innerH

  const pts    = measurePoints.map((p) => ({ x: xOf(p.dayNum), y: yOf(p.weight), w: p.weight }))
  const points = pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const targetY = yOf(targetWeight)
  const baseY   = CHART_H - PAD.bottom

  const firstPt = measurePoints[0]
  const lastPt  = measurePoints[measurePoints.length - 1]

  const yAxisVals = [
    Math.ceil(maxW * 10) / 10,
    Math.round(((maxW + minW) / 2) * 10) / 10,
    Math.floor(minW * 10) / 10,
  ]

  const segmentPaths = pts.slice(0, -1).map((a, i) => {
    const b     = pts[i + 1]
    const rising = b.w > a.w
    const color  = rising ? '#FF3B30' : '#34C759'
    const id     = `grad_${i}`
    const d = [
      `M ${a.x.toFixed(1)} ${baseY}`,
      `L ${a.x.toFixed(1)} ${a.y.toFixed(1)}`,
      `L ${b.x.toFixed(1)} ${b.y.toFixed(1)}`,
      `L ${b.x.toFixed(1)} ${baseY}`,
      'Z',
    ].join(' ')
    return { id, d, color }
  })

  return (
    <View style={chart.wrap}>
      <View style={chart.header}>
        <Text style={chart.title}>체중 변화</Text>
        <View style={chart.legend}>
          <View style={[chart.dot, { backgroundColor: '#34C759' }]} />
          <Text style={chart.legendText}>목표 {targetWeight}kg</Text>
        </View>
      </View>

      <Svg width={CHART_W} height={CHART_H}>
        <Defs>
          {segmentPaths.map(({ id, color }) => (
            <LinearGradient key={id} id={id} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={color} stopOpacity={0.35} />
              <Stop offset="1" stopColor={color} stopOpacity={0} />
            </LinearGradient>
          ))}
        </Defs>

        {segmentPaths.map(({ id, d }) => (
          <Path key={id} d={d} fill={`url(#${id})`} />
        ))}

        {targetY > PAD.top && targetY < CHART_H - PAD.bottom && (
          <Line
            x1={PAD.left} y1={targetY} x2={CHART_W - PAD.right} y2={targetY}
            stroke="#34C759" strokeWidth={1} strokeDasharray="4 3" opacity={0.6}
          />
        )}

        {yAxisVals.map((v, i) => (
          <SvgText key={i} x={PAD.left - 4} y={yOf(v) + 4}
            fontSize={9} fill={colors.textTertiary} textAnchor="end">
            {v.toFixed(1)}
          </SvgText>
        ))}

        {(() => {
          const MIN_GAP = 26
          let lastX = -Infinity
          return measurePoints.map((p, i) => {
            const x = xOf(p.dayNum)
            const isFirst = i === 0
            const isLast  = i === measurePoints.length - 1
            if (!isFirst && !isLast && x - lastX < MIN_GAP) return null
            if (isLast && x - lastX < MIN_GAP) return null
            lastX = x
            return (
              <SvgText key={p.dayNum} x={x} y={CHART_H - 4}
                fontSize={9} fill={colors.textTertiary} textAnchor="middle">
                D+{p.dayNum}
              </SvgText>
            )
          })
        })()}

        <SvgPolyline
          points={points} fill="none"
          stroke={colors.textPrimary} strokeWidth={2}
          strokeLinejoin="round" strokeLinecap="round"
        />

        {measurePoints.map((p, i) => {
          const cx = xOf(p.dayNum)
          const cy = yOf(p.weight)
          const isFirst  = i === 0
          const isLast   = i === measurePoints.length - 1
          const minWeight = Math.min(...weights)
          const isMin    = p.weight === minWeight
          const rising   = i > 0 && p.weight > measurePoints[i - 1].weight
          const dotColor = rising ? '#FF3B30' : '#34C759'
          const showLabel = isFirst || isLast || isMin
          return (
            <React.Fragment key={p.dayNum}>
              {isLast && <Circle cx={cx} cy={cy} r={8} fill={dotColor} opacity={0.15} />}
              <Circle cx={cx} cy={cy} r={isLast ? 5 : 3.5}
                fill={isLast ? dotColor : colors.textSecondary} />
              {showLabel && (
                <SvgText x={cx} y={cy - 10} fontSize={10} fontWeight="700"
                  fill={isLast ? dotColor : colors.textTertiary} textAnchor="middle">
                  {p.weight}
                </SvgText>
              )}
            </React.Fragment>
          )
        })}
      </Svg>

      <View style={chart.statRow}>
        <View style={chart.stat}>
          <Text style={chart.statVal}>{firstPt.weight}kg</Text>
          <Text style={chart.statLbl}>시작</Text>
        </View>
        <View style={chart.stat}>
          <Text style={[chart.statVal, { color: '#34C759' }]}>
            {firstPt.weight > lastPt.weight ? '-' : '+'}{Math.abs(firstPt.weight - lastPt.weight).toFixed(1)}kg
          </Text>
          <Text style={chart.statLbl}>변화</Text>
        </View>
        <View style={chart.stat}>
          <Text style={chart.statVal}>{lastPt.weight}kg</Text>
          <Text style={chart.statLbl}>현재</Text>
        </View>
        <View style={chart.stat}>
          <Text style={chart.statVal}>{targetWeight}kg</Text>
          <Text style={chart.statLbl}>목표</Text>
        </View>
      </View>
    </View>
  )
}

const chart = StyleSheet.create({
  wrap: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#101828', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 2, elevation: 2,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  title:  { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot:    { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 12, color: colors.textTertiary },
  statRow: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.borderSoft },
  stat:    { alignItems: 'center', gap: 3 },
  statVal: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  statLbl: { fontSize: 11, color: colors.textTertiary },
})


const RPE_LABEL: Record<string, string> = {
  easy:     '여유',
  moderate: '적당',
  hard:     '힘듦',
  max:      '한계',
}

// ─── Day Card ─────────────────────────────────────────────────────────────────

function DayCard({ day, isToday, proteinGoal }: { day: DayRecord; isToday: boolean; proteinGoal: number }) {
  const [expanded, setExpanded] = useState(false)
  const totalProtein = day.meals.reduce((s, m) => s + m.totalProtein, 0)
  const totalSets    = day.exercises.reduce((s, e) => s + e.sets, 0)

  const toggle = () => {
    if (day.isFuture) return
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
    setExpanded((v) => !v)
  }

  return (
    <TouchableOpacity
      style={[dc.card, isToday && dc.cardToday, day.isFuture && dc.cardFuture]}
      onPress={toggle}
      activeOpacity={day.isFuture ? 1 : 0.95}
    >
      {/* Card header row */}
      <View style={dc.top}>
        <View style={dc.leftCol}>
          <View style={dc.dayRow}>
            <Text style={[dc.dayNum, day.isFuture && dc.futureText]}>D+{day.dayNum}</Text>
            <Text style={[dc.dateStr, day.isFuture && dc.futureText]}>{day.date}</Text>
            {isToday && <View style={dc.todayPill}><Text style={dc.todayText}>오늘</Text></View>}
            {day.isFuture && <View style={dc.futurePill}><Text style={dc.futurePillText}>예정</Text></View>}
          </View>
          {!day.isFuture && (
            <View style={dc.metaRow}>
              <Text style={dc.meta}>🥩 단백질 {totalProtein}g</Text>
              {totalSets > 0 && (
                <>
                  <Text style={dc.metaSep}>·</Text>
                  <Text style={dc.meta}>💪 {totalSets}세트</Text>
                </>
              )}
              {isMeasureDay(day.dayNum) && day.weight != null && (
                <>
                  <Text style={dc.metaSep}>·</Text>
                  <Text style={[dc.meta, dc.metaWeight]}>⚖️ {day.weight}kg</Text>
                </>
              )}
            </View>
          )}
        </View>
      </View>

      {/* Protein progress bar — 미래는 빈 바만 */}
      <View style={dc.barWrap}>
        {!day.isFuture && (
          <View style={[dc.bar, { width: `${Math.min((totalProtein / Math.max(proteinGoal, 1)) * 100, 100)}%`, backgroundColor: totalProtein >= proteinGoal ? colors.mint : '#FF9500' }]} />
        )}
      </View>
      <Text style={[dc.barLabel, day.isFuture && dc.futureText]}>
        {day.isFuture ? `목표 단백질 ${proteinGoal}g` : `${totalProtein} / ${proteinGoal}g 단백질`}
      </Text>

      {/* Expanded detail */}
      {expanded && (
        <View style={dc.detail}>
          {/* Meals */}
          <Text style={dc.sectionTitle}>식단</Text>
          {day.meals.filter((m) => m.foods.length > 0).map((meal) => (
            <View key={meal.type} style={dc.mealBlock}>
              <View style={dc.mealHeader}>
                <Text style={dc.mealEmoji}>{meal.emoji}</Text>
                <Text style={dc.mealLabel}>{meal.label}</Text>
                <Text style={dc.mealKcal}>단백질 {meal.totalProtein}g</Text>
              </View>
              {meal.foods.map((f, i) => (
                <View key={i} style={dc.foodRow}>
                  <Text style={dc.foodName}>{f.name}</Text>
                  <Text style={dc.foodKcal}>{f.protein}g</Text>
                </View>
              ))}
            </View>
          ))}
          {day.meals.every((m) => m.foods.length === 0) && (
            <Text style={dc.emptyText}>기록된 식단 없음</Text>
          )}

          {/* Exercises */}
          <Text style={[dc.sectionTitle, { marginTop: 14 }]}>운동</Text>
          {day.exercises.length > 0 ? day.exercises.map((ex, i) => (
            <View key={i} style={dc.exCard}>
              <View style={dc.exInfo}>
                <Text style={dc.exName}>{ex.name}</Text>

                {/* 세트별 상세 */}
                {ex.setDetails.length > 0 && (
                  <View style={dc.setList}>
                    {ex.setDetails.map((s, si) => (
                      <View key={si} style={dc.setRow}>
                        <Text style={dc.setNum}>세트{s.setNum}</Text>
                        <Text style={dc.setInfo}>{s.weightKg}kg × {s.reps}회</Text>
                        {s.rpe != null && (
                          <View style={[dc.rpePill, dc.rpePillColors[s.rpe]]}>
                            <Text style={dc.rpeText}>{RPE_LABEL[s.rpe]}</Text>
                          </View>
                        )}
                      </View>
                    ))}
                  </View>
                )}

                {/* 요약 지표 */}
                <View style={dc.exStatRow}>
                  <View style={dc.exStat}>
                    <Text style={dc.exStatVal}>{ex.sets}</Text>
                    <Text style={dc.exStatLbl}>세트</Text>
                  </View>
                  {ex.totalVolume > 0 && (
                    <View style={dc.exStat}>
                      <Text style={dc.exStatVal}>{ex.totalVolume.toLocaleString()}kg</Text>
                      <Text style={dc.exStatLbl}>총 볼륨</Text>
                    </View>
                  )}
                  {ex.estimated1RM != null && (
                    <View style={dc.exStat}>
                      <Text style={[dc.exStatVal, { color: colors.mint }]}>{ex.estimated1RM}kg</Text>
                      <Text style={dc.exStatLbl}>추정 1RM</Text>
                    </View>
                  )}
                </View>
              </View>
            </View>
          )) : (
            <Text style={dc.emptyText}>운동 기록 없음</Text>
          )}
        </View>
      )}
    </TouchableOpacity>
  )
}

const dc = StyleSheet.create({
  card: {
    backgroundColor: colors.surface, borderRadius: 16, marginBottom: 10, padding: 16,
    shadowColor: '#101828', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 2, elevation: 2,
  },
  cardToday:  { borderWidth: 1.5, borderColor: colors.textPrimary },
  cardFuture: { opacity: 0.45 },
  futureText: { color: colors.textTertiary },
  futurePill: { backgroundColor: colors.borderSoft, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  futurePillText: { fontSize: 10, fontWeight: '600', color: colors.textTertiary },

  top:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  leftCol: { flex: 1, gap: 5, paddingRight: 10 },
  dayRow:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dayNum:  { fontSize: 16, fontWeight: '800', color: colors.textPrimary, letterSpacing: -0.4 },
  dateStr: { fontSize: 13, color: colors.textTertiary },
  todayPill:{ backgroundColor: colors.textPrimary, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  todayText:{ fontSize: 10, fontWeight: '700', color: '#fff' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
  meta:       { fontSize: 12, color: colors.textSecondary },
  metaWeight: { fontWeight: '600', color: colors.mint },
  metaSep: { fontSize: 11, color: colors.borderSoft },

  barWrap: { height: 4, borderRadius: 2, backgroundColor: colors.borderSoft, overflow: 'hidden', marginBottom: 4 },
  bar:     { height: 4, borderRadius: 2 },
  barLabel:{ fontSize: 11, color: colors.textTertiary, marginBottom: 8 },

  detail:       { borderTopWidth: 1, borderTopColor: colors.borderSoft, paddingTop: 14, gap: 2 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: colors.textPrimary, marginBottom: 8 },

  mealBlock:  { marginBottom: 10 },
  mealHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  mealEmoji:  { fontSize: 14 },
  mealLabel:  { fontSize: 13, fontWeight: '600', color: colors.textPrimary, flex: 1 },
  mealKcal:   { fontSize: 12, fontWeight: '600', color: colors.textSecondary },

  foodRow:    { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, paddingLeft: 22, borderBottomWidth: 1, borderBottomColor: colors.borderSoft + '80' },
  foodName:   { fontSize: 12, color: colors.textSecondary },
  foodKcal:   { fontSize: 12, color: colors.textTertiary },

  exCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: colors.background, borderRadius: 14,
    padding: 10, marginTop: 4,
  },
  exInfo:     { flex: 1, gap: 8 },
  exName:     { fontSize: 15, fontWeight: '600', color: colors.textPrimary, letterSpacing: -0.3 },
  exStatRow:  { flexDirection: 'row', gap: 16 },
  exStat:     { gap: 2 },
  exStatVal:  { fontSize: 16, fontWeight: '700', color: colors.textPrimary, letterSpacing: -0.4 },
  exStatLbl:  { fontSize: 11, color: colors.textTertiary, fontWeight: '400' },

  setList:   { gap: 4, marginBottom: 8 },
  setRow:    { flexDirection: 'row', alignItems: 'center', gap: 8 },
  setNum:    { fontSize: 11, fontWeight: '600', color: colors.textTertiary, width: 34 },
  setInfo:   { fontSize: 13, fontWeight: '500', color: colors.textSecondary, flex: 1 },
  rpePill:   { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  rpePillColors: {
    easy:     { backgroundColor: '#34C75920' },
    moderate: { backgroundColor: '#FF950020' },
    hard:     { backgroundColor: '#FF6B6B20' },
    max:      { backgroundColor: '#FF3B3020' },
  } as Record<string, object>,
  rpeText:   { fontSize: 10, fontWeight: '700', color: colors.textSecondary },

  emptyText: { fontSize: 12, color: colors.textTertiary, fontStyle: 'italic', paddingVertical: 4 },
})


// ─── Weight Input Modal ───────────────────────────────────────────────────────

function WeightInputModal({ visible, onClose, latestWeight }: {
  visible: boolean
  onClose: () => void
  latestWeight: number
}) {
  const { addEntry } = useWeightLogStore()
  const today = getTodayString()
  const [value, setValue] = useState(latestWeight.toFixed(1))

  const translateY     = useRef(new Animated.Value(400)).current
  const overlayOpacity = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (visible) {
      setValue(latestWeight.toFixed(1))
      translateY.setValue(400)
      overlayOpacity.setValue(0)
      Animated.parallel([
        Animated.timing(overlayOpacity, { toValue: 1, duration: 160, useNativeDriver: true }),
        Animated.spring(translateY, { toValue: 0, useNativeDriver: true, damping: 24, stiffness: 220 }),
      ]).start()
    }
  }, [visible, latestWeight])

  const handleClose = () => {
    Animated.parallel([
      Animated.timing(overlayOpacity, { toValue: 0, duration: 180, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 400, duration: 220, useNativeDriver: true }),
    ]).start(() => onClose())
  }

  const handleSave = () => {
    const n = parseFloat(value)
    if (!isNaN(n) && n > 0 && n < 300) {
      addEntry({ date: today, weight: Math.round(n * 10) / 10 })
      handleClose()
    }
  }

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={handleClose}>
      <Animated.View style={[wm.overlay, { opacity: overlayOpacity }]}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={handleClose} />
        <Animated.View style={[wm.sheet, { transform: [{ translateY }] }]}>
          <View style={wm.handle} />
          <Text style={wm.title}>오늘 체중 입력</Text>
          <View style={wm.inputRow}>
            <TextInput
              style={wm.input}
              value={value}
              onChangeText={setValue}
              keyboardType="decimal-pad"
              selectTextOnFocus
              autoFocus
            />
            <Text style={wm.unit}>kg</Text>
          </View>
          <TouchableOpacity style={wm.btn} onPress={handleSave} activeOpacity={0.85}>
            <Text style={wm.btnText}>저장하기</Text>
          </TouchableOpacity>
        </Animated.View>
      </Animated.View>
    </Modal>
  )
}

const wm = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 24, paddingTop: 12, paddingBottom: 40,
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.borderSoft, alignSelf: 'center', marginBottom: 20 },
  title: { fontSize: 18, fontWeight: '700', color: colors.textPrimary, marginBottom: 20, textAlign: 'center' },
  inputRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 24 },
  input: {
    fontSize: 48, fontWeight: '700', color: colors.textPrimary,
    borderBottomWidth: 2, borderBottomColor: colors.textPrimary,
    minWidth: 120, textAlign: 'center', paddingVertical: 4,
  },
  unit: { fontSize: 24, fontWeight: '500', color: colors.textSecondary },
  btn: {
    backgroundColor: colors.textPrimary, borderRadius: 14,
    height: 52, alignItems: 'center', justifyContent: 'center',
  },
  btnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
})

// ─── Volume Chart ─────────────────────────────────────────────────────────────

function VolumeChart({ logs }: { logs: ExerciseLog[] }) {
  const weeklyVolumes = React.useMemo(() => {
    const map: Record<string, number> = {}
    logs.forEach((l) => {
      if (!l.sets || l.sets.length === 0) return
      const d = new Date(l.date)
      const mon = new Date(d)
      mon.setDate(d.getDate() - ((d.getDay() + 6) % 7))
      const key = mon.toLocaleDateString('en-CA')
      const vol = l.sets.reduce((s, set) => s + (set.weight_kg ?? 0) * (set.reps ?? 0), 0)
      map[key] = (map[key] ?? 0) + vol
    })
    const sorted = Object.entries(map).sort(([a], [b]) => a.localeCompare(b))
    return sorted
  }, [logs])

  const [selectedIndex, setSelectedIndex] = React.useState<number | null>(null)

  // 선택된 인덱스가 범위를 벗어나면 리셋
  React.useEffect(() => {
    if (selectedIndex !== null && selectedIndex >= weeklyVolumes.length) {
      setSelectedIndex(null)
    }
  }, [weeklyVolumes.length])

  if (weeklyVolumes.length < 2) {
    return (
      <View style={vc.wrap}>
        <Text style={vc.title}>주간 볼륨 추이</Text>
        <Text style={vc.empty}>운동 기록이 2주 이상 쌓이면 그래프가 표시돼요</Text>
      </View>
    )
  }

  const values = weeklyVolumes.map(([, v]) => v)
  const maxV   = Math.max(...values) || 1
  const lastIdx = weeklyVolumes.length - 1
  const activeIdx = selectedIndex ?? lastIdx

  const activeVol  = values[activeIdx]
  const firstVol   = values[0]
  const prevVol    = activeIdx > 0 ? values[activeIdx - 1] : null
  const diffVsPrev = prevVol !== null ? activeVol - prevVol : 0
  const diffVsFirst = activeVol - firstVol

  const BAR_W = 28
  const BAR_GAP = 6

  return (
    <View style={vc.wrap}>
      <Text style={vc.title}>주간 볼륨 추이</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={vc.scrollContent}
      >
        <View style={vc.bars}>
          {weeklyVolumes.map(([weekKey, vol], i) => {
            const heightPct = vol / maxV
            const isActive  = i === activeIdx
            const weekNum   = i + 1
            const diff      = i > 0 ? vol - weeklyVolumes[i - 1][1] : 0
            return (
              <Pressable
                key={weekKey}
                style={[vc.barCol, { width: BAR_W }]}
                onPress={() => setSelectedIndex(i === activeIdx && selectedIndex !== null ? null : i)}
              >
                <View style={vc.barTrack}>
                  <View style={[
                    vc.bar,
                    { height: `${Math.max(heightPct * 100, 4)}%` as any },
                    isActive && vc.barActive,
                  ]} />
                </View>
                <Text style={[vc.barLabel, isActive && vc.barLabelActive]}>{weekNum}주</Text>
              </Pressable>
            )
          })}
        </View>
      </ScrollView>
      <View style={vc.statRow}>
        <View style={vc.stat}>
          <Text style={vc.statVal}>{Math.round(activeVol).toLocaleString()}</Text>
          <Text style={vc.statLbl}>{activeIdx + 1}주차 볼륨</Text>
        </View>
        <View style={vc.stat}>
          <Text style={[vc.statVal, { color: diffVsPrev >= 0 ? colors.mint : colors.textTertiary }]}>
            {prevVol !== null
              ? `${diffVsPrev >= 0 ? '+' : ''}${Math.round(diffVsPrev).toLocaleString()}`
              : '-'}
          </Text>
          <Text style={vc.statLbl}>전주 대비</Text>
        </View>
        <View style={vc.stat}>
          <Text style={[vc.statVal, { color: diffVsFirst >= 0 ? colors.mint : colors.textTertiary }]}>
            {activeIdx > 0
              ? `${diffVsFirst >= 0 ? '+' : ''}${Math.round(diffVsFirst).toLocaleString()}`
              : '-'}
          </Text>
          <Text style={vc.statLbl}>첫 주 대비</Text>
        </View>
      </View>
    </View>
  )
}

const vc = StyleSheet.create({
  wrap:          { backgroundColor: colors.surface, borderRadius: 20, padding: 16, marginBottom: 12 },
  header:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  title:         { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
  unit:          { fontSize: 12, color: colors.textTertiary },
  empty:         { fontSize: 13, color: colors.textTertiary, textAlign: 'center', paddingVertical: 24 },
  scrollContent: { paddingBottom: 4 },
  bars:          { flexDirection: 'row', alignItems: 'flex-end', height: 110, gap: 6, marginBottom: 12 },
  barCol:        { alignItems: 'center', gap: 4 },
  diffLabel:     { fontSize: 9, fontWeight: '700', marginBottom: 2 },
  barTrack:      { flex: 1, width: '100%', justifyContent: 'flex-end' },
  bar:           { width: '100%', borderRadius: 4, backgroundColor: colors.borderSoft },
  barActive:     { backgroundColor: colors.mint },
  barLabel:      { fontSize: 9, color: colors.textTertiary, fontWeight: '500' },
  barLabelActive: { color: colors.mint, fontWeight: '700' },
  statRow:       { flexDirection: 'row', justifyContent: 'space-around', paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.borderSoft },
  stat:          { alignItems: 'center', gap: 3 },
  statVal:       { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  statLbl:       { fontSize: 11, color: colors.textTertiary },
})

// ─── Streak Calendar ──────────────────────────────────────────────────────────

function StreakCalendar({ logs }: { logs: ExerciseLog[] }) {
  const activeDates = React.useMemo(() => new Set(logs.map((l) => l.date)), [logs])

  // 최근 10주 (70일)
  const today = new Date()
  const days: { date: string; active: boolean; isToday: boolean }[] = []
  for (let i = 69; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(today.getDate() - i)
    const str = d.toLocaleDateString('en-CA')
    days.push({ date: str, active: activeDates.has(str), isToday: i === 0 })
  }

  // 연속 운동일 계산
  let streak = 0
  const d = new Date(today)
  while (true) {
    const str = d.toLocaleDateString('en-CA')
    if (!activeDates.has(str)) break
    streak++
    d.setDate(d.getDate() - 1)
  }

  const weeks: typeof days[] = []
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7))

  return (
    <View style={sc.wrap}>
      <View style={sc.header}>
        <Text style={sc.title}>운동 스트릭</Text>
        <View style={sc.badge}>
          <Text style={sc.badgeTxt}>🔥 {streak}일 연속</Text>
        </View>
      </View>
      <View style={sc.grid}>
        {weeks.map((week, wi) => (
          <View key={wi} style={sc.week}>
            {week.map((day) => (
              <View
                key={day.date}
                style={[
                  sc.cell,
                  day.active && sc.cellActive,
                  day.isToday && sc.cellToday,
                ]}
              />
            ))}
          </View>
        ))}
      </View>
      <View style={sc.legend}>
        <View style={sc.legendItem}>
          <View style={[sc.cell, { marginRight: 0 }]} />
          <Text style={sc.legendTxt}>운동 없음</Text>
        </View>
        <View style={sc.legendItem}>
          <View style={[sc.cell, sc.cellActive, { marginRight: 0 }]} />
          <Text style={sc.legendTxt}>운동 완료</Text>
        </View>
      </View>
    </View>
  )
}

const CELL = 12
const sc = StyleSheet.create({
  wrap:       { backgroundColor: colors.surface, borderRadius: 20, padding: 16, marginBottom: 12 },
  header:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  title:      { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
  badge:      { backgroundColor: `${colors.mint}20`, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  badgeTxt:   { fontSize: 13, fontWeight: '700', color: colors.mint },
  grid:       { flexDirection: 'row', gap: 3 },
  week:       { gap: 3 },
  cell:       { width: CELL, height: CELL, borderRadius: 3, backgroundColor: colors.borderSoft },
  cellActive: { backgroundColor: colors.mint },
  cellToday:  { borderWidth: 2, borderColor: colors.textPrimary },
  legend:     { flexDirection: 'row', gap: 14, marginTop: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendTxt:  { fontSize: 11, color: colors.textTertiary },
})

// ─── Weekly Muscle Heatmap ────────────────────────────────────────────────────

function getMuscleSetMap(logs: ExerciseLog[], weekOffset: number): Partial<Record<MuscleGroup, number>> {
  const today = new Date()
  const startOfWeek = new Date(today)
  startOfWeek.setDate(today.getDate() - ((today.getDay() + 6) % 7) - weekOffset * 7)
  startOfWeek.setHours(0, 0, 0, 0)
  const endOfWeek = new Date(startOfWeek)
  endOfWeek.setDate(startOfWeek.getDate() + 6)
  endOfWeek.setHours(23, 59, 59, 999)
  const startStr = startOfWeek.toLocaleDateString('en-CA')
  const endStr   = endOfWeek.toLocaleDateString('en-CA')
  const map: Partial<Record<MuscleGroup, number>> = {}
  for (const log of logs) {
    if (log.date < startStr || log.date > endStr) continue
    const sets = log.sets?.length ?? 0
    for (const m of log.exercise.primary_muscles as MuscleGroup[])
      map[m] = (map[m] ?? 0) + sets
    for (const m of log.exercise.secondary_muscles as MuscleGroup[])
      map[m] = (map[m] ?? 0) + Math.floor(sets * 0.5)
  }
  return map
}

function WeeklyMuscleHeatmap({ logs }: { logs: ExerciseLog[] }) {
  const PAGE_W = SW - 32  // 카드 내부 너비 (wrap padding 16 * 2)
  const scrollRef = useRef<ScrollView>(null)
  const [currentPage, setCurrentPage] = useState(0)

  const maxOffset = React.useMemo(() => {
    if (logs.length === 0) return 4
    const today = new Date()
    const thisMonday = new Date(today)
    thisMonday.setDate(today.getDate() - ((today.getDay() + 6) % 7))
    thisMonday.setHours(0, 0, 0, 0)
    let max = 0
    for (const log of logs) {
      const d = new Date(log.date)
      const diff = Math.round((thisMonday.getTime() - d.getTime()) / (7 * 24 * 60 * 60 * 1000))
      if (diff > max) max = diff
    }
    return Math.max(max, 4)
  }, [logs])

  // pages: 과거순 → 최신 (index 0 = 가장 오래된, 마지막 = 이번 주)
  const totalPages = maxOffset + 1
  const pages = Array.from({ length: totalPages }, (_, i) => totalPages - 1 - i) // offset: 오래된 순

  // 첫 렌더 시 마지막 페이지(이번 주)로 이동
  useEffect(() => {
    const lastIdx = totalPages - 1
    setCurrentPage(lastIdx)
    setTimeout(() => {
      scrollRef.current?.scrollTo({ x: lastIdx * PAGE_W, animated: false })
    }, 0)
  }, [])

  const weekLabel = (offset: number) =>
    offset === 0 ? '이번 주' : offset === 1 ? '지난 주' : `${offset}주 전`

  const currentOffset = pages[currentPage] ?? 0
  const currentMap    = React.useMemo(() => getMuscleSetMap(logs, currentOffset), [logs, currentOffset])
  const totalSets     = Object.values(currentMap).reduce((a, b) => a + (b ?? 0), 0)

  return (
    <View style={wh.wrap}>
      {/* 헤더 */}
      <View style={wh.header}>
        <Text style={wh.title}>주간 근육 자극 현황</Text>
        <Text style={wh.weekBadge}>{weekLabel(currentOffset)}</Text>
      </View>
      <Text style={wh.sub}>총 {totalSets}세트</Text>

      {/* 페이지 인디케이터 도트 */}
      <View style={wh.dots}>
        {pages.map((_, i) => (
          <View key={i} style={[wh.dot, i === currentPage && wh.dotActive]} />
        ))}
      </View>

      {/* 스와이프 영역 — 좌우 화살표 오버레이 포함 */}
      <View style={wh.swipeContainer}>
        {/* 왼쪽 화살표 */}
        <View style={[wh.arrowOverlay, wh.arrowLeft, currentPage === 0 && wh.arrowHidden]}>
          <Text style={wh.arrowTxt}>‹</Text>
        </View>

        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={16}
          decelerationRate="fast"
          onMomentumScrollEnd={(e) => {
            const idx = Math.round(e.nativeEvent.contentOffset.x / PAGE_W)
            setCurrentPage(Math.min(Math.max(idx, 0), totalPages - 1))
          }}
          style={{ width: PAGE_W }}
        >
          {pages.map((offset) => {
            const map  = getMuscleSetMap(logs, offset)
            const sets = Object.values(map).reduce((a, b) => a + (b ?? 0), 0)
            return (
              <View key={offset} style={{ width: PAGE_W }}>
                {sets === 0 ? (
                  <Text style={wh.empty}>{weekLabel(offset)} 운동 기록이 없어요</Text>
                ) : (
                  <MuscleHeatmap muscleSetMap={map} scale={1.2} showToggle />
                )}
              </View>
            )
          })}
        </ScrollView>

        {/* 오른쪽 화살표 */}
        <View style={[wh.arrowOverlay, wh.arrowRight, currentPage === totalPages - 1 && wh.arrowHidden]}>
          <Text style={wh.arrowTxt}>›</Text>
        </View>
      </View>
    </View>
  )
}

const wh = StyleSheet.create({
  wrap:           { backgroundColor: colors.surface, borderRadius: 20, padding: 16, marginBottom: 12 },
  header:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  title:          { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
  weekBadge:      { fontSize: 12, fontWeight: '600', color: colors.mint, backgroundColor: `${colors.mint}18`, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 },
  sub:            { fontSize: 12, color: colors.textTertiary, marginBottom: 8 },
  dots:           { flexDirection: 'row', justifyContent: 'center', gap: 5, marginBottom: 12 },
  dot:            { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.borderSoft },
  dotActive:      { backgroundColor: colors.mint, width: 14 },
  swipeContainer: { position: 'relative' },
  arrowOverlay:   { position: 'absolute', top: 0, bottom: 0, justifyContent: 'center', zIndex: 10 },
  arrowLeft:      { left: -8 },
  arrowRight:     { right: -8 },
  arrowTxt:       { fontSize: 22, color: colors.textTertiary, fontWeight: '300' },
  arrowHidden:    { opacity: 0 },
  empty:          { fontSize: 13, color: colors.textTertiary, textAlign: 'center', paddingVertical: 24 },
})

// ─── Body Photos (Before / After) ─────────────────────────────────────────────

interface PhotoEntry { uri: string; date: string; label: string }

const DUMMY_PHOTOS: PhotoEntry[] = [
  { uri: 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=400&q=80', date: '2026-02-10', label: 'Before' },
  { uri: 'https://images.unsplash.com/photo-1583454110551-21f2fa2afe61?w=400&q=80', date: '2026-05-09', label: 'Week 12' },
]

function BodyPhotos() {
  const [photos, setPhotos] = useState<PhotoEntry[]>(DUMMY_PHOTOS)
  const [previewPhoto, setPreviewPhoto] = useState<PhotoEntry | null>(null)

  const pickPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') {
      Alert.alert('권한 필요', '사진 라이브러리 접근 권한이 필요해요.')
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
      allowsEditing: true,
      aspect: [3, 4],
    })
    if (!result.canceled && result.assets[0]) {
      const today = getTodayString()
      const count = photos.length
      const label = count === 0 ? 'Before' : `Week ${Math.ceil(count / 1)}`
      setPhotos((prev) => [...prev, { uri: result.assets[0].uri, date: today, label }])
    }
  }

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync()
    if (status !== 'granted') {
      Alert.alert('권한 필요', '카메라 접근 권한이 필요해요.')
      return
    }
    const result = await ImagePicker.launchCameraAsync({
      quality: 0.7,
      allowsEditing: true,
      aspect: [3, 4],
    })
    if (!result.canceled && result.assets[0]) {
      const today = getTodayString()
      const count = photos.length
      const label = count === 0 ? 'Before' : `Week ${Math.ceil(count / 1)}`
      setPhotos((prev) => [...prev, { uri: result.assets[0].uri, date: today, label }])
    }
  }

  const handleAddPhoto = () => {
    Alert.alert('사진 추가', '체형 변화 사진을 추가해요', [
      { text: '카메라', onPress: takePhoto },
      { text: '앨범에서 선택', onPress: pickPhoto },
      { text: '취소', style: 'cancel' },
    ])
  }

  const handleLongPress = (photo: PhotoEntry) => {
    Alert.alert('사진 삭제', `${photo.label} 사진을 삭제할까요?`, [
      { text: '삭제', style: 'destructive', onPress: () => setPhotos((prev) => prev.filter((p) => p.uri !== photo.uri)) },
      { text: '취소', style: 'cancel' },
    ])
  }

  const CARD_W = SW * 0.44

  return (
    <View style={bp.wrap}>
      <View style={bp.header}>
        <View>
          <Text style={bp.title}>바디 사진</Text>
          <Text style={bp.subtitle}>{photos.length > 0 ? `${photos.length}장 · 변화를 확인해요` : '12주 변화를 눈으로 확인해요'}</Text>
        </View>
        <TouchableOpacity style={bp.addBtn} onPress={handleAddPhoto} activeOpacity={0.7}>
          <Text style={bp.addBtnTxt}>+ 추가</Text>
        </TouchableOpacity>
      </View>

      {photos.length === 0 ? (
        <TouchableOpacity style={bp.emptyFull} onPress={handleAddPhoto} activeOpacity={0.7}>
          <Text style={bp.emptyFullIcon}>📸</Text>
          <Text style={bp.emptyFullTitle}>첫 번째 사진을 찍어요</Text>
          <Text style={bp.emptyFullDesc}>지금 모습이 12주 후 Before가 돼요{'\n'}오늘 바로 찍어두세요!</Text>
        </TouchableOpacity>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={bp.timeline}
          decelerationRate="fast"
          snapToInterval={CARD_W + 10}
        >
          {photos.map((p, i) => {
            const isFirst  = i === 0
            const isLast   = i === photos.length - 1
            const tag      = isFirst ? 'Before' : isLast && photos.length > 1 ? 'After' : p.label
            const tagColor = isFirst ? colors.textTertiary : isLast ? colors.mint : colors.textSecondary
            return (
              <TouchableOpacity
                key={p.uri}
                style={[bp.card, { width: CARD_W }]}
                onPress={() => setPreviewPhoto(p)}
                onLongPress={() => handleLongPress(p)}
                activeOpacity={0.88}
              >
                <Image source={{ uri: p.uri }} style={[bp.cardImg, { width: CARD_W }]} resizeMode="cover" />
                <View style={bp.cardFooter}>
                  <View style={[bp.cardTag, { backgroundColor: tagColor + '22' }]}>
                    <Text style={[bp.cardTagTxt, { color: tagColor }]}>{tag}</Text>
                  </View>
                  <Text style={bp.cardDate}>{p.date}</Text>
                </View>
              </TouchableOpacity>
            )
          })}
          <TouchableOpacity style={[bp.addCard, { width: CARD_W * 0.6 }]} onPress={handleAddPhoto} activeOpacity={0.7}>
            <Text style={bp.addCardIcon}>📸</Text>
            <Text style={bp.addCardTxt}>추가</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* 전체화면 프리뷰 모달 */}
      <Modal visible={!!previewPhoto} transparent animationType="fade" onRequestClose={() => setPreviewPhoto(null)}>
        <TouchableOpacity style={bp.modalOverlay} activeOpacity={1} onPress={() => setPreviewPhoto(null)}>
          {previewPhoto && (
            <View style={bp.modalContent}>
              <Image source={{ uri: previewPhoto.uri }} style={bp.modalImage} resizeMode="contain" />
              <View style={bp.modalMeta}>
                <Text style={bp.modalLabel}>{previewPhoto.label}</Text>
                <Text style={bp.modalDate}>{previewPhoto.date}</Text>
              </View>
            </View>
          )}
        </TouchableOpacity>
      </Modal>
    </View>
  )
}

const bp = StyleSheet.create({
  wrap:           { backgroundColor: colors.surface, borderRadius: 20, padding: 16, marginBottom: 12 },
  header:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 },
  title:          { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
  subtitle:       { fontSize: 11, color: colors.textTertiary, marginTop: 2 },
  addBtn:         { backgroundColor: `${colors.mint}20`, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  addBtnTxt:      { fontSize: 13, fontWeight: '700', color: colors.mint },
  timeline:       { gap: 10, paddingBottom: 4, paddingRight: 4 },
  card:           { borderRadius: 16, overflow: 'hidden', backgroundColor: colors.background },
  cardImg:        { height: 220 },
  cardFooter:     { paddingHorizontal: 10, paddingVertical: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTag:        { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  cardTagTxt:     { fontSize: 11, fontWeight: '700' },
  cardDate:       { fontSize: 10, color: colors.textTertiary },
  addCard:        { borderRadius: 16, backgroundColor: colors.background, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.borderSoft, alignItems: 'center', justifyContent: 'center', height: 220 + 38, gap: 8 },
  addCardIcon:    { fontSize: 28 },
  addCardTxt:     { fontSize: 13, fontWeight: '600', color: colors.textTertiary },
  emptyFull:      { borderRadius: 16, backgroundColor: colors.background, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.borderSoft, alignItems: 'center', justifyContent: 'center', paddingVertical: 36, gap: 8 },
  emptyFullIcon:  { fontSize: 36 },
  emptyFullTitle: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  emptyFullDesc:  { fontSize: 13, color: colors.textTertiary, textAlign: 'center', lineHeight: 20 },
  modalOverlay:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
  modalContent:   { width: SW - 32, alignItems: 'center', gap: 12 },
  modalImage:     { width: SW - 32, height: (SW - 32) * 4 / 3, borderRadius: 16 },
  modalMeta:      { alignItems: 'center', gap: 4 },
  modalLabel:     { fontSize: 15, fontWeight: '700', color: '#fff' },
  modalDate:      { fontSize: 12, color: 'rgba(255,255,255,0.6)' },
})

// ─── Dummy Data (개발용 — DB 연결 전 미리보기용) ──────────────────────────────

function useSeedDummyData() {
  const { logs: existingExLogs, seedDummy: seedEx } = useExerciseLogStore()
  const { entries: wEntries, seedDummy: seedWeight } = useWeightLogStore()
  const { logs: mLogs, seedDummy: seedDiet } = useDietStore()

  React.useEffect(() => {
    if (existingExLogs.length > 0 || wEntries.length > 0 || mLogs.length > 0) return

    const today = new Date()
    const dateOf = (daysAgo: number) => {
      const d = new Date(today)
      d.setDate(today.getDate() - daysAgo)
      return d.toLocaleDateString('en-CA')
    }

    // ── 체중 — 8주치 3일 간격 ──
    const weightValues = [78.4, 78.1, 77.9, 77.6, 77.3, 77.0, 76.8, 76.5, 76.2, 75.9, 75.7, 75.4]
    const weightEntries = weightValues.map((w, i) => ({ date: dateOf(i * 3), weight: w }))
    const startDate = weightEntries[weightEntries.length - 1].date
    seedWeight(weightEntries, startDate)

    // ── 운동 로그 — 5주치 주 3회 ──
    const exPlan = [
      { id: '0CXGHya', name_ko: '케이블 크로스오버',       pm: ['chest'],  sm: ['triceps'],              sets: [{w:40,r:12,rpe:'moderate'},{w:42,r:10,rpe:'hard'},{w:42,r:9,rpe:'hard'}] },
      { id: '11wrviz', name_ko: '아이소메트릭 와이퍼',     pm: ['chest'],  sm: ['triceps'],              sets: [{w:0, r:15,rpe:'easy'},   {w:0, r:12,rpe:'moderate'},{w:0, r:10,rpe:'hard'}] },
      { id: '0I5fUyn', name_ko: '밴드 언더핸드 풀다운',   pm: ['lats'],   sm: ['biceps','forearms'],     sets: [{w:30,r:12,rpe:'moderate'},{w:32,r:10,rpe:'hard'},{w:32,r:9,rpe:'max'}] },
      { id: '0MlxeMn', name_ko: '케이블 풀다운',           pm: ['lats'],   sm: ['biceps','forearms'],     sets: [{w:50,r:10,rpe:'moderate'},{w:52,r:8, rpe:'hard'},{w:52,r:8,rpe:'hard'}] },
      { id: '0lQnxMZ', name_ko: '웨이티드 시시 스쿼트',   pm: ['quads'],  sm: ['glutes','hamstrings','calves'], sets: [{w:20,r:12,rpe:'moderate'},{w:22,r:10,rpe:'hard'},{w:22,r:9,rpe:'max'}] },
      { id: '5BZHW9s', name_ko: '스쿼트 오버헤드 리치',   pm: ['quads'],  sm: ['glutes','hamstrings'],   sets: [{w:0, r:15,rpe:'easy'},   {w:0, r:12,rpe:'moderate'},{w:0, r:10,rpe:'hard'}] },
      { id: '0dCyly0', name_ko: '바벨 브래드포드 프레스', pm: ['shoulders'], sm: ['triceps','lats'],    sets: [{w:30,r:10,rpe:'moderate'},{w:32,r:8, rpe:'hard'},{w:32,r:8,rpe:'hard'}] },
      { id: '0CXGHya', name_ko: '케이블 크로스오버 +2.5', pm: ['chest'],  sm: ['triceps'],              sets: [{w:42,r:12,rpe:'moderate'},{w:44,r:10,rpe:'hard'},{w:44,r:9,rpe:'hard'}] },
    ]
    const workoutDays = [0,2,4, 7,9,11, 14,16,18, 21,23,25, 28,30,32, 35,37,39]
    const exLogs = workoutDays.flatMap((daysAgo, i) => {
      const date = dateOf(daysAgo)
      const a = exPlan[(i * 2) % exPlan.length]
      const b = exPlan[(i * 2 + 1) % exPlan.length]
      return [a, b].map((ex, ei) => ({
        id: `dummy-${daysAgo}-${ei}`,
        user_id: 'dummy',
        date,
        exercise: {
          id: ex.id, name: ex.name_ko, name_ko: ex.name_ko,
          category: 'strength' as const, equipment: 'cable' as const, difficulty: 'beginner' as const,
          primary_muscles: ex.pm as any, secondary_muscles: ex.sm as any, instructions: [],
        },
        sets: ex.sets.map((s, si) => ({ set_number: si + 1, weight_kg: s.w, reps: s.r, rpe: s.rpe as any })),
        calories_burned: 0,
        created_at: new Date().toISOString(),
      }))
    })
    seedEx(exLogs)

    // ── 식단 로그 — 최근 14일 ──
    const mealTemplates = [
      { meal_type: 'breakfast' as const, protein: 32, foods: [{ name: '닭가슴살 샌드위치', protein: 32 }] },
      { meal_type: 'lunch'     as const, protein: 55, foods: [{ name: '현미밥 + 닭볶음', protein: 40 }, { name: '두부구이', protein: 15 }] },
      { meal_type: 'dinner'    as const, protein: 48, foods: [{ name: '연어 스테이크', protein: 35 }, { name: '그릭 요거트', protein: 13 }] },
      { meal_type: 'snack'     as const, protein: 25, foods: [{ name: '단백질 쉐이크', protein: 25 }] },
    ]
    const mealLogs = Array.from({ length: 14 }, (_, d) =>
      mealTemplates.map((m, mi) => ({
        id: `dummy-meal-${d}-${mi}`,
        user_id: 'dummy',
        date: dateOf(d),
        meal_type: m.meal_type,
        foods: m.foods.map((f) => ({
          id: `f-${d}-${mi}`, name: f.name, amount: '100g',
          nutrition: { calories: f.protein * 4, protein: f.protein, carbs: 20, fat: 5 },
        })),
        total_nutrition: { calories: m.protein * 4, protein: m.protein, carbs: 20, fat: 5 },
        created_at: new Date().toISOString(),
      }))
    ).flat()
    seedDiet(mealLogs)
  }, [])
}

// ─── Record Screen ────────────────────────────────────────────────────────────

const MEAL_LABEL: Record<string, { label: string; emoji: string }> = {
  breakfast: { label: '아침', emoji: '🌅' },
  lunch:     { label: '점심', emoji: '☀️' },
  dinner:    { label: '저녁', emoji: '🌙' },
  snack:     { label: '간식', emoji: '🍎' },
}

type RecordTab = 'progress' | 'log'

export default function RecordScreen() {
  useSeedDummyData()
  const insets  = useSafeAreaInsets()
  const [activeTab, setActiveTab] = useState<RecordTab>('progress')

  const { bodyInfo, programStartedAt } = useAuthStore()
  const { logs: mealLogs } = useDietStore()
  const { logs: exerciseLogs } = useExerciseLogStore()
  const { entries: weightEntries, getProgramDay, getEntry: getWeightEntry, getLatest } = useWeightLogStore()
  const [weightModalVisible, setWeightModalVisible] = useState(false)
  const latestWeight = getLatest()?.weight ?? (bodyInfo?.weight ?? 70)

  const buildInfo = bodyInfo as BuildBodyInfo | null
  const buildGoals = buildInfo
    ? calculateBuildGoals(buildInfo, programStartedAt ?? getTodayString())
    : null

  const proteinGoal  = buildGoals?.proteinGoal ?? 160
  const targetWeight = bodyInfo?.target_weight ?? 0
  const today = getTodayString()

  const targetDays = 84
  const startDate = programStartedAt
    ? new Date(programStartedAt).toLocaleDateString('en-CA')
    : (weightEntries.length > 0 ? weightEntries[0].date : today)

  const days = React.useMemo((): DayRecord[] => {
    const result: DayRecord[] = []
    const start  = new Date(startDate)
    const endDay = new Date(start)
    endDay.setDate(start.getDate() + targetDays - 1)
    const cur = new Date(start)

    while (cur <= endDay) {
      const dateStr  = cur.toLocaleDateString('en-CA')
      const dayNum   = Math.floor((cur.getTime() - start.getTime()) / 86_400_000) + 1
      const dm       = `${cur.getMonth() + 1}/${cur.getDate()}`
      const isFuture = dateStr > today

      // 해당일 meal_logs → MealEntry[]
      const dayMealLogs = mealLogs.filter((l) => l.date === dateStr)
      const mealsMap: Record<string, MealEntry> = {}
      for (const log of dayMealLogs) {
        const cfg = MEAL_LABEL[log.meal_type] ?? { label: log.meal_type, emoji: '🍽' }
        mealsMap[log.meal_type] = {
          type: log.meal_type,
          label: cfg.label,
          emoji: cfg.emoji,
          totalProtein: Math.round(log.total_nutrition.protein),
          foods: log.foods.map((f) => ({ name: f.name, protein: Math.round(f.nutrition.protein) })),
        }
      }

      // 해당일 exercise_logs → ExEntry[]
      const dayExLogs = exerciseLogs.filter((l) => l.date === dateStr)
      const exercises: ExEntry[] = dayExLogs.map((l) => {
        const rawSets = l.sets ?? []
        const strengthSets = rawSets.filter((s) => s.weight_kg != null && s.reps != null)
        const setDetails: SetDetail[] = strengthSets.map((s) => ({
          setNum: s.set_number,
          weightKg: s.weight_kg!,
          reps: s.reps!,
          rpe: s.rpe,
        }))
        const maxWeightKg = setDetails.length > 0
          ? Math.max(...setDetails.map((s) => s.weightKg)) || null
          : null
        const totalVolume = setDetails.reduce((sum, s) => sum + s.weightKg * s.reps, 0)
        const estimated1RM = setDetails.length > 0
          ? Math.max(...setDetails.map((s) => s.weightKg * (1 + s.reps / 30)))
          : null
        return {
          name: l.exercise.name_ko ?? l.exercise.name,
          sets: rawSets.length,
          maxWeightKg,
          setDetails,
          totalVolume,
          estimated1RM: estimated1RM != null ? Math.round(estimated1RM * 10) / 10 : null,
        }
      })

      result.push({
        dayNum,
        date: dm,
        dateStr,
        weight: getWeightEntry(dateStr)?.weight,
        meals: Object.values(mealsMap),
        exercises,
        isFuture,
      })

      cur.setDate(cur.getDate() + 1)
    }
    return result
  }, [startDate, today, mealLogs, exerciseLogs, weightEntries])

  // 오늘 → 과거(최신→오래된 순) → 미래(가까운→먼 순)
  const sortedDays = React.useMemo(() => {
    const past   = days.filter((d) => d.dateStr <= today).reverse()  // 오늘 포함, 최신순
    const future = days.filter((d) => d.dateStr > today)             // 내일부터, 가까운 순
    return [...past, ...future]
  }, [days, today])


  return (
    <View style={[rs.root, { paddingTop: insets.top }]}>
      {/* 헤더 */}
      <View style={rs.header}>
        <Text style={rs.headerTitle}>기록</Text>
        <TouchableOpacity style={rs.weightBtn} onPress={() => setWeightModalVisible(true)} activeOpacity={0.7}>
          <Text style={rs.weightBtnText}>⚖️ 체중 입력</Text>
        </TouchableOpacity>
      </View>

      {/* 탭 */}
      <View style={rs.tabBar}>
        {([
          { key: 'progress', label: '성장 현황' },
          { key: 'log',      label: '일별 기록' },
        ] as { key: RecordTab; label: string }[]).map((t) => (
          <TouchableOpacity
            key={t.key}
            style={[rs.tab, activeTab === t.key && rs.tabActive]}
            onPress={() => setActiveTab(t.key)}
            activeOpacity={0.8}
          >
            <Text style={[rs.tabText, activeTab === t.key && rs.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        style={rs.scroll}
        contentContainerStyle={rs.content}
        showsVerticalScrollIndicator={false}
      >
        {activeTab === 'progress' ? (
          <>
            <WeeklyMuscleHeatmap logs={exerciseLogs} />
            <VolumeChart logs={exerciseLogs} />
            <StreakCalendar logs={exerciseLogs} />
            <WeightChart days={days} targetWeight={targetWeight} />
            <BodyPhotos />
          </>
        ) : (
          <>
            {sortedDays.map((day) => (
              <DayCard key={day.dayNum} day={day} isToday={day.dateStr === today} proteinGoal={proteinGoal} />
            ))}
          </>
        )}
        <View style={{ height: 32 }} />
      </ScrollView>

      <WeightInputModal
        visible={weightModalVisible}
        onClose={() => setWeightModalVisible(false)}
        latestWeight={latestWeight}
      />
    </View>
  )
}

const rs = StyleSheet.create({
  root:    { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 12,
  },
  headerTitle: { fontSize: 22, fontWeight: '700', color: colors.textPrimary, letterSpacing: -0.5 },
  weightBtn: {
    backgroundColor: colors.surface, borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 6,
    borderWidth: 1, borderColor: colors.borderSoft,
  },
  weightBtnText: { fontSize: 13, fontWeight: '600', color: colors.textPrimary },

  tabBar: {
    flexDirection: 'row',
    marginHorizontal: 20, marginBottom: 12, marginTop: 8,
    backgroundColor: colors.backgroundSecondary ?? colors.borderSoft,
    borderRadius: 12, padding: 3,
  },
  tab: {
    flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 9,
  },
  tabActive: { backgroundColor: colors.surface, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 2, elevation: 2 },
  tabText:   { fontSize: 14, fontWeight: '600', color: colors.textTertiary },
  tabTextActive: { color: colors.textPrimary },

  scroll:  { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 110 },
})

import React, { useState, useRef, useEffect } from 'react'
import { router } from 'expo-router'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  LayoutAnimation,
  Platform,
  UIManager,
  Dimensions,
  Animated,
  PanResponder,
  Modal,
  TextInput,
  KeyboardAvoidingView,
} from 'react-native'
import { Svg, Polyline as SvgPolyline, Circle, Line, Text as SvgText, Path, Defs, LinearGradient, Stop } from 'react-native-svg'
import MapView, { Polyline, Marker, PROVIDER_DEFAULT } from 'react-native-maps'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors } from '@repo/theme'
import { getTodayString } from '@repo/shared'
import { useAuthStore } from '../../store/auth'
import { kgToDisplay, displayToKg, weightUnit } from '../../lib/locale'
import { useDietStore } from '../../store/diet'
import { useExerciseLogStore } from '../../store/exerciseLog'
import { useWeightLogStore } from '../../store/weightLog'
import { useStepsLogStore } from '../../store/stepsLog'
import { useCoachStore } from '../../store/coach'
import { t } from '../../lib/i18n'

if (Platform.OS === 'android') {
  UIManager.setLayoutAnimationEnabledExperimental?.(true)
}

const SW = Dimensions.get('window').width

// ─── Types ────────────────────────────────────────────────────────────────────

interface FoodEntry { name: string; kcal: number }
interface MealEntry { type: string; label: string; emoji: string; foods: FoodEntry[]; total: number }

interface RouteCoord { latitude: number; longitude: number }

interface ExEntry {
  name: string
  minutes: number
  kcal: number
  amount?: number
  unit?: string
  route?: RouteCoord[]
}
interface DayRecord {
  dayNum: number
  date: string
  dateStr: string  // YYYY-MM-DD
  weight?: number
  steps?: number
  meals: MealEntry[]
  exercises: ExEntry[]
  isFuture: boolean
}

// ─── Route Generation ─────────────────────────────────────────────────────────

const CX = 37.5270
const CY = 126.9330
const COS_LAT = Math.cos(CX * Math.PI / 180)

function ovalRoute(rKm: number, pts: number, offsetDeg = 0, aspectX = 1, aspectY = 1): RouteCoord[] {
  return Array.from({ length: pts + 1 }, (_, i) => {
    const a = ((i / pts) * 360 + offsetDeg) * (Math.PI / 180)
    return {
      latitude:  CX + (rKm * aspectY / 111) * Math.cos(a),
      longitude: CY + (rKm * aspectX / (111 * COS_LAT)) * Math.sin(a),
    }
  })
}

// 5 predefined routes for 5 exercise types
const ROUTES: Record<string, RouteCoord[][]> = {
  '러닝':     [ovalRoute(0.80, 32, 0,   1.4, 1.0), ovalRoute(0.75, 32, 30,  1.2, 1.0), ovalRoute(0.85, 32, 60, 1.5, 0.9)],
  '파워워킹': [ovalRoute(0.60, 28, 15,  1.0, 1.3), ovalRoute(0.65, 28, 45,  0.9, 1.2), ovalRoute(0.55, 28, 80, 1.1, 1.1)],
  '자전거':   [ovalRoute(1.80, 50, 0,   1.6, 1.0), ovalRoute(1.70, 50, 45,  1.4, 1.1), ovalRoute(1.90, 50, 90, 1.5, 0.9)],
  '줄넘기':   [],
  '계단오르기': [],
}

function getRoute(name: string, dayNum: number): RouteCoord[] | undefined {
  const pool = ROUTES[name]
  if (!pool || pool.length === 0) return undefined
  return pool[(dayNum - 1) % pool.length]
}

// ─── MapView Route Mini-Map ───────────────────────────────────────────────────

function RouteMiniMap({ route }: { route: RouteCoord[] }) {
  if (route.length < 2) return null

  const lats   = route.map((c) => c.latitude)
  const lngs   = route.map((c) => c.longitude)
  const minLat = Math.min(...lats), maxLat = Math.max(...lats)
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs)
  const pad    = 0.0008

  const region = {
    latitude:      (minLat + maxLat) / 2,
    longitude:     (minLng + maxLng) / 2,
    latitudeDelta:  Math.max(maxLat - minLat, 0.003) + pad,
    longitudeDelta: Math.max(maxLng - minLng, 0.003) + pad,
  }

  return (
    <View style={rm.wrap}>
      <MapView
        provider={PROVIDER_DEFAULT}
        style={rm.map}
        region={region}
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
          coordinates={route}
          strokeColor="#30D158"
          strokeWidth={3}
          lineCap="round"
          lineJoin="round"
        />
        <Marker coordinate={route[0]} anchor={{ x: 0.5, y: 0.5 }}>
          <View style={rm.startDot} />
        </Marker>
        <Marker coordinate={route[route.length - 1]} anchor={{ x: 0.5, y: 0.5 }}>
          <View style={rm.endDot} />
        </Marker>
      </MapView>
    </View>
  )
}

const rm = StyleSheet.create({
  wrap:     { width: 108, height: 88, borderRadius: 12, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(0,0,0,0.08)' },
  map:      { flex: 1 },
  startDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#636366', borderWidth: 1.5, borderColor: '#fff' },
  endDot:   { width: 10, height: 10, borderRadius: 5, backgroundColor: '#30D158', borderWidth: 2, borderColor: '#fff' },
})


const MOCK_LEADERBOARD = [
  { rank: 1, name: '박지훈', emoji: '🏆', score: 1147, streak: 9,  isMe: false },
  { rank: 2, name: '김민준', emoji: '👤', score: 1089, streak: 7,  isMe: true  },
  { rank: 3, name: '이서연', emoji: '🌸', score: 1043, streak: 8,  isMe: false },
  { rank: 4, name: '최예린', emoji: '⭐', score:  987, streak: 6,  isMe: false },
  { rank: 5, name: '정우성', emoji: '🔥', score:  934, streak: 5,  isMe: false },
  { rank: 6, name: '한소희', emoji: '🌿', score:  876, streak: 4,  isMe: false },
  { rank: 7, name: '오현석', emoji: '💪', score:  821, streak: 3,  isMe: false },
  { rank: 8, name: '윤채원', emoji: '🌙', score:  768, streak: 2,  isMe: false },
]

// Previous session ranking — me was at rank 5
const MOCK_LEADERBOARD_PREV = [
  { rank: 1, name: '박지훈', emoji: '🏆', score: 1147, streak: 9,  isMe: false },
  { rank: 2, name: '이서연', emoji: '🌸', score: 1043, streak: 8,  isMe: false },
  { rank: 3, name: '최예린', emoji: '⭐', score:  987, streak: 6,  isMe: false },
  { rank: 4, name: '정우성', emoji: '🔥', score:  934, streak: 5,  isMe: false },
  { rank: 5, name: '김민준', emoji: '👤', score:  912, streak: 7,  isMe: true  },
  { rank: 6, name: '한소희', emoji: '🌿', score:  876, streak: 4,  isMe: false },
  { rank: 7, name: '오현석', emoji: '💪', score:  821, streak: 3,  isMe: false },
  { rank: 8, name: '윤채원', emoji: '🌙', score:  768, streak: 2,  isMe: false },
]

const ACHIEVEMENT_MESSAGES = [
  '🏆 박지훈님 D+9 달성! 오늘 조깅 35분 · -3.8kg 진행 중',
  '🔥 이서연님 칼로리 목표 8일 연속 달성 · 현재 2위',
  '💪 최예린님 이번 주 운동 5회 완료 · 목표까지 -1.2kg',
  '🎉 정우성님 오늘 점수 95점 달성! 역대 최고 기록',
  '⭐ 한소희님 D+4 첫 운동 목표 달성 · 기세 오르는 중',
  '🌟 오현석님 식단 기록 7일 연속 완주 · 꾸준함이 최고',
]

// ─── Marquee Banner ───────────────────────────────────────────────────────────

function MarqueeBanner() {
  const translateX = useRef(new Animated.Value(0)).current
  const [itemWidth, setItemWidth] = useState(0)

  const content = ACHIEVEMENT_MESSAGES.join('     ✦     ') + '     ✦     '

  useEffect(() => {
    if (itemWidth <= 0) return
    translateX.setValue(0)
    Animated.loop(
      Animated.timing(translateX, {
        toValue: -itemWidth,
        duration: itemWidth * 22,
        useNativeDriver: true,
      })
    ).start()
    return () => translateX.stopAnimation()
  }, [itemWidth])

  return (
    <View style={mq.wrap}>
      <View style={mq.badge}>
        <View style={mq.liveDot} />
        <Text style={mq.badgeText}>LIVE</Text>
      </View>
      <View style={mq.track}>
        <Animated.View style={{ flexDirection: 'row', transform: [{ translateX }] }}>
          <Text
            style={mq.text}
            numberOfLines={1}
            onLayout={(e) => {
              if (itemWidth === 0) setItemWidth(e.nativeEvent.layout.width)
            }}
          >
            {content}
          </Text>
          {/* 두 번째 복사본 — 첫 번째가 끝날 때 바로 이어짐 */}
          <Text style={mq.text} numberOfLines={1}>{content}</Text>
        </Animated.View>
      </View>
    </View>
  )
}

const mq = StyleSheet.create({
  wrap:  {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface, borderRadius: 12,
    marginBottom: 14, overflow: 'hidden',
    height: 38,
    shadowColor: '#101828', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 2, elevation: 2,
  },
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#FF3B30', paddingHorizontal: 9, height: '100%',
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' },
  badgeText: { fontSize: 10, fontWeight: '800', color: '#fff', letterSpacing: 0.5 },
  track: { flex: 1, overflow: 'hidden', paddingHorizontal: 10 },
  text:  { fontSize: 13, fontWeight: '500', color: colors.textSecondary, whiteSpace: 'nowrap' as any },
})

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
  const unitSystem = useAuthStore((s) => s.unitSystem)
  const wUnit = weightUnit(unitSystem)

  const today = getTodayString()
  const totalDays = Math.max(days.length, 1)

  // 측정일 데이터 포인트: weightLog entries에서 dayNum 계산
  const measurePoints = entries
    .filter((e) => isMeasureDay(getProgramDay(e.date)))
    .map((e) => ({ dayNum: getProgramDay(e.date), weight: e.weight }))

  if (measurePoints.length < 2) {
    return (
      <View style={chart.wrap}>
        <Text style={chart.title}>{t('record_chart_title')}</Text>
        <Text style={{ color: colors.textTertiary, fontSize: 13, textAlign: 'center', paddingVertical: 32 }}>
          {t('record_chart_no_data')}
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
        <Text style={chart.title}>{t('record_chart_title')}</Text>
        <View style={chart.legend}>
          <View style={[chart.dot, { backgroundColor: '#34C759' }]} />
          <Text style={chart.legendText}>{t('record_chart_goal')} {kgToDisplay(targetWeight, unitSystem)}{wUnit}</Text>
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
            {kgToDisplay(v, unitSystem).toFixed(1)}
          </SvgText>
        ))}

        {measurePoints.map((p) => (
          <SvgText key={p.dayNum} x={xOf(p.dayNum)} y={CHART_H - 4}
            fontSize={9} fill={colors.textTertiary} textAnchor="middle">
            D+{p.dayNum}
          </SvgText>
        ))}

        <SvgPolyline
          points={points} fill="none"
          stroke={colors.textPrimary} strokeWidth={2}
          strokeLinejoin="round" strokeLinecap="round"
        />

        {measurePoints.map((p, i) => {
          const cx = xOf(p.dayNum)
          const cy = yOf(p.weight)
          const isLast   = i === measurePoints.length - 1
          const rising   = i > 0 && p.weight > measurePoints[i - 1].weight
          const dotColor = rising ? '#FF3B30' : '#34C759'
          return (
            <React.Fragment key={p.dayNum}>
              {isLast && <Circle cx={cx} cy={cy} r={8} fill={dotColor} opacity={0.15} />}
              <Circle cx={cx} cy={cy} r={isLast ? 5 : 3.5}
                fill={isLast ? dotColor : colors.textSecondary} />
              <SvgText x={cx} y={cy - 10} fontSize={10} fontWeight="700"
                fill={isLast ? dotColor : colors.textTertiary} textAnchor="middle">
                {kgToDisplay(p.weight, unitSystem).toFixed(1)}
              </SvgText>
            </React.Fragment>
          )
        })}
      </Svg>

      <View style={chart.statRow}>
        <View style={chart.stat}>
          <Text style={chart.statVal}>{kgToDisplay(firstPt.weight, unitSystem).toFixed(1)}{wUnit}</Text>
          <Text style={chart.statLbl}>{t('record_stat_start')}</Text>
        </View>
        <View style={chart.stat}>
          <Text style={[chart.statVal, { color: '#34C759' }]}>
            {firstPt.weight > lastPt.weight ? '-' : '+'}{Math.abs(kgToDisplay(firstPt.weight, unitSystem) - kgToDisplay(lastPt.weight, unitSystem)).toFixed(1)}{wUnit}
          </Text>
          <Text style={chart.statLbl}>{t('record_stat_change')}</Text>
        </View>
        <View style={chart.stat}>
          <Text style={chart.statVal}>{kgToDisplay(lastPt.weight, unitSystem).toFixed(1)}{wUnit}</Text>
          <Text style={chart.statLbl}>{t('record_stat_current')}</Text>
        </View>
        <View style={chart.stat}>
          <Text style={chart.statVal}>{kgToDisplay(targetWeight, unitSystem).toFixed(1)}{wUnit}</Text>
          <Text style={chart.statLbl}>{t('record_chart_goal')}</Text>
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

// ─── Score Badge ──────────────────────────────────────────────────────────────

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 80 ? '#34C759' : score >= 60 ? '#FF9500' : '#FF3B30'
  return (
    <View style={[sb.wrap, { backgroundColor: color + '18', borderColor: color + '40' }]}>
      <Text style={[sb.text, { color }]}>{score}</Text>
      <Text style={[sb.unit, { color }]}>점</Text>
    </View>
  )
}

const sb = StyleSheet.create({
  wrap:  { flexDirection: 'row', alignItems: 'baseline', gap: 1, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, borderWidth: 1 },
  text:  { fontSize: 20, fontWeight: '800', letterSpacing: -0.5 },
  unit:  { fontSize: 11, fontWeight: '600' },
})

// ─── Day Card ─────────────────────────────────────────────────────────────────

function DayCard({ day, isToday, calorieGoal }: { day: DayRecord; isToday: boolean; calorieGoal: number }) {
  const [expanded, setExpanded] = useState(false)
  const unitSystem = useAuthStore((s) => s.unitSystem)
  const wUnit = weightUnit(unitSystem)
  const totalConsumed = day.meals.reduce((s, m) => s + m.total, 0)
  const totalBurned   = day.exercises.reduce((s, e) => s + e.kcal, 0)

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
            {isToday && <View style={dc.todayPill}><Text style={dc.todayText}>{t('record_today')}</Text></View>}
            {day.isFuture && <View style={dc.futurePill}><Text style={dc.futurePillText}>{t('record_future')}</Text></View>}
          </View>
          {!day.isFuture && (
            <View style={dc.metaRow}>
              <Text style={dc.meta}>🍽 {totalConsumed} kcal</Text>
              <Text style={dc.metaSep}>·</Text>
              <Text style={dc.meta}>🏃 {totalBurned} kcal {t('record_burned_unit')}</Text>
              {day.steps != null && day.steps > 0 && (
                <>
                  <Text style={dc.metaSep}>·</Text>
                  <Text style={dc.meta}>👟 {t('record_steps', day.steps)}</Text>
                </>
              )}
              {isMeasureDay(day.dayNum) && day.weight != null && (
                <>
                  <Text style={dc.metaSep}>·</Text>
                  <Text style={[dc.meta, dc.metaWeight]}>⚖️ {kgToDisplay(day.weight!, unitSystem).toFixed(1)}{wUnit}</Text>
                </>
              )}
            </View>
          )}
        </View>
      </View>

      {/* Calorie progress bar — 미래는 빈 바만 */}
      <View style={dc.barWrap}>
        {!day.isFuture && (
          <View style={[dc.bar, { width: `${Math.min((totalConsumed / Math.max(calorieGoal, 1)) * 100, 100)}%`, backgroundColor: totalConsumed > calorieGoal ? '#FF3B30' : '#34C759' }]} />
        )}
      </View>
      <Text style={[dc.barLabel, day.isFuture && dc.futureText]}>
        {day.isFuture ? `${t('record_chart_goal')} ${calorieGoal} kcal` : `${totalConsumed} / ${calorieGoal} kcal`}
      </Text>

      {/* Expanded detail */}
      {expanded && (
        <View style={dc.detail}>
          {/* Meals */}
          <Text style={dc.sectionTitle}>{t('record_diet_section')}</Text>
          {day.meals.filter((m) => m.foods.length > 0).map((meal) => (
            <View key={meal.type} style={dc.mealBlock}>
              <View style={dc.mealHeader}>
                <Text style={dc.mealEmoji}>{meal.emoji}</Text>
                <Text style={dc.mealLabel}>{meal.label}</Text>
                <Text style={dc.mealKcal}>{meal.total} kcal</Text>
              </View>
              {meal.foods.map((f, i) => (
                <View key={i} style={dc.foodRow}>
                  <Text style={dc.foodName}>{f.name}</Text>
                  <Text style={dc.foodKcal}>{f.kcal} kcal</Text>
                </View>
              ))}
            </View>
          ))}
          {day.meals.every((m) => m.foods.length === 0) && (
            <Text style={dc.emptyText}>{t('record_no_diet')}</Text>
          )}

          {/* Steps */}
          {day.steps != null && day.steps > 0 && (
            <View style={dc.stepsRow}>
              <Text style={dc.stepsIcon}>👟</Text>
              <Text style={dc.stepsText}>{t('record_steps', day.steps)}</Text>
            </View>
          )}

          {/* Exercises */}
          <Text style={[dc.sectionTitle, { marginTop: 14 }]}>{t('record_exercise_section')}</Text>
          {day.exercises.length > 0 ? day.exercises.map((ex, i) => (
            <View key={i} style={dc.exCard}>
              {ex.route && <RouteMiniMap route={ex.route} />}
              <View style={dc.exInfo}>
                <Text style={dc.exName}>{ex.name}</Text>
                <View style={dc.exStatRow}>
                  {ex.amount != null && (
                    <View style={dc.exStat}>
                      <Text style={dc.exStatVal}>{ex.amount}{ex.unit}</Text>
                      <Text style={dc.exStatLbl}>{t('record_distance')}</Text>
                    </View>
                  )}
                  <View style={dc.exStat}>
                    <Text style={dc.exStatVal}>{t('record_duration_min', ex.minutes)}</Text>
                    <Text style={dc.exStatLbl}>{t('record_duration')}</Text>
                  </View>
                  <View style={dc.exStat}>
                    <Text style={[dc.exStatVal, { color: '#30D158' }]}>{ex.kcal}</Text>
                    <Text style={dc.exStatLbl}>kcal</Text>
                  </View>
                </View>
              </View>
            </View>
          )) : (
            <Text style={dc.emptyText}>{t('record_no_exercise')}</Text>
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

  emptyText: { fontSize: 12, color: colors.textTertiary, fontStyle: 'italic', paddingVertical: 4 },
  stepsRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.borderSoft, marginTop: 10 },
  stepsIcon: { fontSize: 16 },
  stepsText: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
})

// ─── Leaderboard ──────────────────────────────────────────────────────────────

const RANK_COLORS: Record<number, string> = { 1: '#FFD700', 2: '#C0C0C0', 3: '#CD7F32' }
const RANK_LABELS: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' }

function LeaderboardView({ isVisible }: { isVisible: boolean }) {
  const [displayList, setDisplayList] = useState(MOCK_LEADERBOARD_PREV)
  const [animDone, setAnimDone] = useState(false)
  const [displayRank, setDisplayRank] = useState(5)
  const [showRankBadge, setShowRankBadge] = useState(false)

  const badgeScale = useRef(new Animated.Value(0)).current
  const meGlowOpacity = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (!isVisible || animDone) return

    const t1 = setTimeout(() => {
      // Green glow flash on me row
      Animated.sequence([
        Animated.timing(meGlowOpacity, { toValue: 1, duration: 250, useNativeDriver: true }),
        Animated.timing(meGlowOpacity, { toValue: 0, duration: 500, delay: 400, useNativeDriver: true }),
      ]).start()

      // Rank counter: 5 → 4 → 3 → 2
      let r = 5
      const interval = setInterval(() => {
        r--
        setDisplayRank(r)
        if (r <= 2) clearInterval(interval)
      }, 220)

      // Reorder list with spring layout animation
      LayoutAnimation.configureNext({
        duration: 650,
        create:  { type: 'easeInEaseOut', property: 'opacity' },
        update:  { type: 'spring', springDamping: 0.75 },
        delete:  { type: 'easeInEaseOut', property: 'opacity' },
      })
      setDisplayList(MOCK_LEADERBOARD)

      // Rank-up badge bounce in after list settles
      setTimeout(() => {
        setShowRankBadge(true)
        Animated.spring(badgeScale, {
          toValue: 1,
          useNativeDriver: true,
          damping: 8,
          stiffness: 180,
        }).start()
      }, 850)

      setAnimDone(true)
    }, 700)

    return () => clearTimeout(t1)
  }, [isVisible, animDone])

  const myData = displayList.find((u) => u.isMe)!

  return (
    <View style={lb.wrap}>
      {/* Scrolling achievement banner */}
      <MarqueeBanner />

      {/* Condition badge */}
      <View style={lb.conditionCard}>
        <Text style={lb.conditionTitle}>같은 조건 참가자 그룹</Text>
        <View style={lb.conditionChips}>
          <View style={lb.chip}><Text style={lb.chipText}>🎯 감량 목표</Text></View>
          <View style={lb.chip}><Text style={lb.chipText}>⚖️ 시작 체중 68~72kg</Text></View>
          <View style={lb.chip}><Text style={lb.chipText}>📅 14일 챌린지</Text></View>
        </View>
        <Text style={lb.conditionSub}>비슷한 출발선에서 시작한 {MOCK_LEADERBOARD.length}명과 경쟁 중</Text>
      </View>

      {/* My summary */}
      <View style={lb.myCard}>
        <Text style={lb.myRankNum}>#{displayRank}</Text>
        <View style={{ flex: 1 }}>
          <Text style={lb.myName}>내 순위</Text>
          <Text style={lb.myScore}>{myData.score}점</Text>
        </View>
        <View style={lb.myStreak}>
          <Text style={lb.myStreakNum}>{myData.streak}</Text>
          <Text style={lb.myStreakLbl}>일 연속</Text>
        </View>
      </View>

      {/* Ranking list */}
      {displayList.map((user) => (
        <View key={user.name} style={[lb.row, user.isMe && lb.rowMe]}>
          {/* Green glow overlay for me row during animation */}
          {user.isMe && (
            <Animated.View
              style={[lb.meGlow, { opacity: meGlowOpacity }]}
              pointerEvents="none"
            />
          )}

          <View style={lb.rankWrap}>
            {user.rank <= 3 ? (
              <Text style={lb.rankEmoji}>{RANK_LABELS[user.rank]}</Text>
            ) : (
              <Text style={[lb.rankNum, { color: RANK_COLORS[user.rank] ?? colors.textTertiary }]}>
                {user.rank}
              </Text>
            )}
          </View>
          <Text style={lb.avatar}>{user.emoji}</Text>
          <View style={{ flex: 1 }}>
            <Text style={[lb.name, user.isMe && lb.nameMe]}>{user.name}{user.isMe ? ' (나)' : ''}</Text>
            <Text style={lb.streak}>{user.streak}일 연속 🔥</Text>
          </View>
          <View style={lb.scoreWrap}>
            <Text style={[lb.score, user.isMe && lb.scoreMe]}>{user.score.toLocaleString()}점</Text>
            {user.isMe && showRankBadge && (
              <Animated.View style={[lb.rankUpBadge, { transform: [{ scale: badgeScale }] }]}>
                <Text style={lb.rankUpText}>↑ 3</Text>
              </Animated.View>
            )}
          </View>
        </View>
      ))}
    </View>
  )
}

const lb = StyleSheet.create({
  wrap: { gap: 0 },

  conditionCard: {
    backgroundColor: colors.surface, borderRadius: 14, padding: 14,
    marginBottom: 12, gap: 8,
    borderWidth: 1, borderColor: colors.borderSoft,
  },
  conditionTitle: { fontSize: 13, fontWeight: '700', color: colors.textPrimary },
  conditionChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    backgroundColor: colors.background, borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 4,
    borderWidth: 1, borderColor: colors.borderSoft,
  },
  chipText: { fontSize: 11, fontWeight: '600', color: colors.textSecondary },
  conditionSub: { fontSize: 11, color: colors.textTertiary },

  myCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: colors.textPrimary, borderRadius: 16, padding: 16, marginBottom: 12,
  },
  myRankNum: { fontSize: 28, fontWeight: '800', color: '#fff', letterSpacing: -1 },
  myName:    { fontSize: 12, color: 'rgba(255,255,255,0.7)', marginBottom: 2 },
  myScore:   { fontSize: 20, fontWeight: '700', color: '#fff' },
  myStreak:  { alignItems: 'center' },
  myStreakNum:{ fontSize: 24, fontWeight: '800', color: '#fff' },
  myStreakLbl:{ fontSize: 11, color: 'rgba(255,255,255,0.7)' },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: colors.surface, borderRadius: 12, padding: 14, marginBottom: 8,
    shadowColor: '#101828', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03, shadowRadius: 1, elevation: 1,
  },
  rowMe: { borderWidth: 1.5, borderColor: colors.textPrimary },

  rankWrap:  { width: 28, alignItems: 'center' },
  rankEmoji: { fontSize: 20 },
  rankNum:   { fontSize: 16, fontWeight: '700' },

  avatar: { fontSize: 24 },
  name:   { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  nameMe: { color: colors.textPrimary },
  streak: { fontSize: 11, color: colors.textTertiary, marginTop: 2 },

  scoreWrap: { alignItems: 'flex-end', gap: 3 },
  score:  { fontSize: 16, fontWeight: '700', color: colors.textSecondary },
  scoreMe:{ color: colors.textPrimary },

  meGlow: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    borderRadius: 12, backgroundColor: '#34C75930',
  },

  rankUpBadge: {
    backgroundColor: '#34C759', borderRadius: 6,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  rankUpText: { fontSize: 11, fontWeight: '800', color: '#fff', letterSpacing: 0.3 },
})

// ─── Pace Alert Modal ────────────────────────────────────────────────────────

function PaceAlertModal({ visible, onAdjust, onRestart, onDismiss, extraMinutes }: {
  visible: boolean
  extraMinutes: number
  onAdjust: () => void
  onRestart: () => void
  onDismiss: () => void
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={pa.overlay}>
        <View style={pa.box}>
          <Text style={pa.emoji}>⚠️</Text>
          <Text style={pa.title}>{t('record_pace_title')}</Text>
          <Text style={pa.desc}>{t('record_pace_desc', extraMinutes)}</Text>
          <TouchableOpacity style={pa.btnPrimary} onPress={onAdjust} activeOpacity={0.85}>
            <Text style={pa.btnPrimaryText}>{t('record_pace_adjust', extraMinutes)}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={pa.btnSecondary} onPress={onRestart} activeOpacity={0.85}>
            <Text style={pa.btnSecondaryText}>{t('record_pace_restart')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={pa.btnDismiss} onPress={onDismiss} activeOpacity={0.7}>
            <Text style={pa.btnDismissText}>{t('record_pace_dismiss')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}

const pa = StyleSheet.create({
  overlay:        { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  box:            { width: '100%', backgroundColor: colors.surface, borderRadius: 24, padding: 28, alignItems: 'center' },
  emoji:          { fontSize: 36, marginBottom: 12 },
  title:          { fontSize: 20, fontWeight: '800', color: colors.textPrimary, letterSpacing: -0.4, marginBottom: 10, textAlign: 'center' },
  desc:           { fontSize: 14, color: colors.textSecondary, lineHeight: 22, textAlign: 'center', marginBottom: 24 },
  bold:           { fontWeight: '700', color: colors.textPrimary },
  btnPrimary:     { width: '100%', backgroundColor: colors.textPrimary, borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginBottom: 10 },
  btnPrimaryText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  btnSecondary:   { width: '100%', backgroundColor: colors.error + '18', borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginBottom: 10 },
  btnSecondaryText: { fontSize: 15, fontWeight: '600', color: colors.error },
  btnDismiss:     { paddingVertical: 10 },
  btnDismissText: { fontSize: 13, color: colors.textTertiary },
})

// ─── Weight Input Modal ───────────────────────────────────────────────────────

function WeightInputModal({ visible, onClose, latestWeight, onPaceAlert }: {
  visible: boolean
  onClose: () => void
  latestWeight: number  // always kg
  onPaceAlert?: (extraMinutes: number) => void
}) {
  const { addEntry } = useWeightLogStore()
  const unitSystem = useAuthStore((s) => s.unitSystem)
  const wUnit = weightUnit(unitSystem)
  const today = getTodayString()
  // value는 표시 단위 (lb or kg) 문자열
  const [value, setValue] = useState(kgToDisplay(latestWeight, unitSystem).toFixed(1))
  const { recalculate } = useCoachStore()

  const translateY     = useRef(new Animated.Value(400)).current
  const overlayOpacity = useRef(new Animated.Value(0)).current
  const inputRef       = useRef<any>(null)

  useEffect(() => {
    if (visible) {
      setValue(kgToDisplay(latestWeight, unitSystem).toFixed(1))
      translateY.setValue(400)
      overlayOpacity.setValue(0)
      Animated.parallel([
        Animated.timing(overlayOpacity, { toValue: 1, duration: 160, useNativeDriver: true }),
        Animated.spring(translateY, { toValue: 0, useNativeDriver: true, damping: 24, stiffness: 220 }),
      ]).start(() => {
        inputRef.current?.focus()
      })
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
    if (!isNaN(n) && n > 0 && n < 660) {
      const roundedKg = Math.round(displayToKg(n, unitSystem) * 10) / 10
      addEntry({ date: today, weight: roundedKg })
      const { bodyInfo, programStartedAt } = useAuthStore.getState()
      if (bodyInfo && programStartedAt) {
        recalculate(bodyInfo, programStartedAt, 0, 0, roundedKg)
      }
      // recalculate 후 최신 goals 읽기
      const goals = useCoachStore.getState().goals
      const bodyInfo2 = useAuthStore.getState().bodyInfo
      if (goals && !goals.isOnTrack && onPaceAlert && bodyInfo2) {
        const extraMinutes = goals.exerciseGoalMinutesAdjusted - (bodyInfo2.exercise_minutes_per_day ?? 30)
        onPaceAlert(Math.max(10, extraMinutes))
      }
      handleClose()
    }
  }

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={handleClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <Animated.View style={[wm.overlay, { opacity: overlayOpacity }]}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={handleClose} />
          <Animated.View style={[wm.sheet, { transform: [{ translateY }] }]}>
            <View style={wm.handle} />
            <Text style={wm.title}>{t('record_weight_modal_title')}</Text>
            <View style={wm.inputRow}>
              <TextInput
                style={wm.input}
                value={value}
                onChangeText={setValue}
                ref={inputRef}
                keyboardType="decimal-pad"
                selectTextOnFocus
              />
              <Text style={wm.unit}>{wUnit}</Text>
            </View>
            <TouchableOpacity style={wm.btn} onPress={handleSave} activeOpacity={0.85}>
              <Text style={wm.btnText}>{t('record_weight_save')}</Text>
            </TouchableOpacity>
          </Animated.View>
        </Animated.View>
      </KeyboardAvoidingView>
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

// ─── Record Screen ────────────────────────────────────────────────────────────

type TopTab = 'record' // | 'leaderboard'

const TABS: TopTab[] = ['record'] // leaderboard 비활성화

const MEAL_LABEL: Record<string, { label: () => string; emoji: string }> = {
  breakfast: { label: () => t('diet_breakfast'), emoji: '🌅' },
  lunch:     { label: () => t('diet_lunch'),     emoji: '☀️' },
  dinner:    { label: () => t('diet_dinner'),    emoji: '🌙' },
  snack:     { label: () => t('diet_snack'),     emoji: '🍎' },
}

export default function RecordScreen() {
  const insets = useSafeAreaInsets()
  const [activeTab, setActiveTab] = useState<TopTab>('record')
  const activeTabRef = useRef<TopTab>('record')

  const { bodyInfo, macroGoals, isProgramEnded } = useAuthStore()
  const { logs: mealLogs } = useDietStore()
  const { logs: exerciseLogs } = useExerciseLogStore()
  const { entries: weightEntries, getProgramDay, isMeasureDay: isWtMeasureDay, getEntry: getWeightEntry, getLatest } = useWeightLogStore()
  const { getEntry: getStepsEntry } = useStepsLogStore()
  const [weightModalVisible, setWeightModalVisible] = useState(false)
  const [paceAlertVisible, setPaceAlertVisible] = useState(false)
  const [paceExtraMinutes, setPaceExtraMinutes] = useState(10)
  const latestWeight = getLatest()?.weight ?? (bodyInfo?.weight ?? 70)

  // 측정일이고 오늘 체중 기록이 없으면 자동 팝업
  useEffect(() => {
    const alreadyLogged = !!getWeightEntry(today)
    if (isWtMeasureDay(today) && !alreadyLogged) {
      const timer = setTimeout(() => setWeightModalVisible(true), 800)
      return () => clearTimeout(timer)
    }
  }, [])

  const calorieGoal = macroGoals?.calories ?? 1700
  const targetWeight = bodyInfo?.target_weight ?? 0
  const today = getTodayString()

  // 프로그램 시작일~종료일(D+targetDays) 전체 날짜 생성
  const { programStartedAt } = useAuthStore()
  const targetDays = bodyInfo?.target_days ?? 14
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
      const dateStr = cur.toLocaleDateString('en-CA')
      const dayNum  = Math.floor((cur.getTime() - start.getTime()) / 86_400_000) + 1
      const dm      = `${cur.getMonth() + 1}/${cur.getDate()}`
      const isFuture = dateStr > today

      // 해당일 meal_logs → MealEntry[]
      const dayMealLogs = mealLogs.filter((l) => l.date === dateStr)
      const mealsMap: Record<string, MealEntry> = {}
      for (const log of dayMealLogs) {
        const cfg = MEAL_LABEL[log.meal_type] ?? { label: () => log.meal_type, emoji: '🍽' }
        mealsMap[log.meal_type] = {
          type: log.meal_type,
          label: cfg.label(),
          emoji: cfg.emoji,
          total: log.total_nutrition.calories,
          foods: log.foods.map((f) => ({ name: f.name, kcal: f.nutrition.calories })),
        }
      }

      // 해당일 exercise_logs → ExEntry[]
      const dayExLogs = exerciseLogs.filter((l) => l.date === dateStr)
      const exercises: ExEntry[] = dayExLogs.map((l) => ({
        name: l.exercise.name_ko ?? l.exercise.name,
        minutes: l.duration_minutes ?? 0,
        kcal: l.calories_burned ?? 0,
        amount: l.amount,
        route: l.route,
      }))

      const weightEntry = getWeightEntry(dateStr)
      const stepsEntry  = getStepsEntry(dateStr)

      result.push({
        dayNum,
        date: dm,
        dateStr,
        weight: weightEntry?.weight,
        steps: stepsEntry?.steps,
        meals: Object.values(mealsMap),
        exercises,
        isFuture,
      })

      cur.setDate(cur.getDate() + 1)
    }
    return result
  }, [startDate, targetDays, today, mealLogs, exerciseLogs, weightEntries, getStepsEntry])

  // 오늘 → 과거(최신→오래된 순) → 미래(가까운→먼 순)
  const sortedDays = React.useMemo(() => {
    const past   = days.filter((d) => d.dateStr <= today).reverse()  // 오늘 포함, 최신순
    const future = days.filter((d) => d.dateStr > today)             // 내일부터, 가까운 순
    return [...past, ...future]
  }, [days, today])

  const indicatorAnim = useRef(new Animated.Value(0)).current

  const switchTab = (tab: TopTab) => {
    activeTabRef.current = tab
    setActiveTab(tab)
    Animated.spring(indicatorAnim, {
      toValue: tab === 'record' ? 0 : 1,
      useNativeDriver: true,
      damping: 20,
      stiffness: 200,
    }).start()
  }

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gs) =>
        Math.abs(gs.dx) > Math.abs(gs.dy) * 2.5 && Math.abs(gs.dx) > 12,
      onPanResponderRelease: (_, gs) => {
        if (gs.dx < -50 && activeTabRef.current === 'record') {
          switchTab('leaderboard')
        } else if (gs.dx > 50 && activeTabRef.current === 'leaderboard') {
          switchTab('record')
        }
      },
    })
  ).current

  return (
    <View style={[rs.root, { paddingTop: insets.top }]}>
      {isProgramEnded && <View style={rs.endedOverlay} pointerEvents="none" />}
      {/* 헤더 */}
      <View style={rs.header}>
        <Text style={rs.headerTitle}>{t('record_title')}</Text>
        <TouchableOpacity style={rs.weightBtn} onPress={() => setWeightModalVisible(true)} activeOpacity={0.7} disabled={isProgramEnded}>
          <Text style={rs.weightBtnText}>{t('record_weight_btn')}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={rs.scroll}
        contentContainerStyle={rs.content}
        showsVerticalScrollIndicator={false}
      >
        <WeightChart days={days} targetWeight={targetWeight} />
        {sortedDays.map((day) => (
          <DayCard key={day.dayNum} day={day} isToday={day.dateStr === today} calorieGoal={calorieGoal} />
        ))}
        <View style={{ height: 32 }} />
      </ScrollView>

      <WeightInputModal
        visible={weightModalVisible}
        onClose={() => setWeightModalVisible(false)}
        latestWeight={latestWeight}
        onPaceAlert={(extraMin) => {
          setPaceExtraMinutes(extraMin)
          setPaceAlertVisible(true)
        }}
      />
      <PaceAlertModal
        visible={paceAlertVisible}
        extraMinutes={paceExtraMinutes}
        onAdjust={() => {
          const { bodyInfo } = useAuthStore.getState()
          if (bodyInfo) {
            useAuthStore.setState({
              bodyInfo: {
                ...bodyInfo,
                exercise_minutes_per_day: (bodyInfo.exercise_minutes_per_day ?? 30) + paceExtraMinutes,
              },
            })
            const { programStartedAt } = useAuthStore.getState()
            const latest = getLatest()
            if (programStartedAt) {
              useCoachStore.getState().recalculate(bodyInfo, programStartedAt, 0, 0, latest?.weight)
            }
          }
          setPaceAlertVisible(false)
        }}
        onRestart={() => {
          setPaceAlertVisible(false)
          router.replace('/onboarding')
        }}
        onDismiss={() => setPaceAlertVisible(false)}
      />
    </View>
  )
}

const rs = StyleSheet.create({
  root:    { flex: 1, backgroundColor: colors.background },
  endedOverlay: { ...StyleSheet.absoluteFillObject, zIndex: 99 },
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

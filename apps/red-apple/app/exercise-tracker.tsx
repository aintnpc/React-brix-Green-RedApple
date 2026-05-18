import { useState, useEffect, useRef } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity,
  Animated, Dimensions, ScrollView,
} from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { Svg, Circle } from 'react-native-svg'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { calculateExerciseCalories } from '@repo/shared'
import type { RouteCoord } from '@repo/shared'
import { useAuthStore } from '../store/auth'
import { useExerciseLogStore } from '../store/exerciseLog'
import { getTodayString } from '@repo/shared'
import { colorsDark as colors } from '@repo/theme'
import { ShareStickerModal } from './exercise-share'
import { sendExerciseCompletionSummary } from '../lib/notifications'
import { useDietStore } from '../store/diet'
import { useCoachStore } from '../store/coach'

type Phase = 'tracking' | 'done'

const SW = Dimensions.get('window').width
const SH = Dimensions.get('window').height

// ─── Helpers ──────────────────────────────────────────────────────────────────

const OUTDOOR_SPEED_KMH: Record<string, number> = {
  '러닝': 9,
  '파워워킹': 5.5,
  '자전거': 18,
}

function fmt(sec: number) {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function estimatedDistance(sec: number, name: string) {
  const speedKmH = OUTDOOR_SPEED_KMH[name] ?? 8
  return ((speedKmH * sec) / 3600).toFixed(2)
}

function paceOrSpeed(sec: number, name: string) {
  if (name === '자전거') return `${OUTDOOR_SPEED_KMH['자전거']}`
  const dist = parseFloat(estimatedDistance(sec, name))
  if (dist === 0) return "--'--\""
  const minPerKm = sec / 60 / dist
  const m = Math.floor(minPerKm)
  const s = Math.round((minPerKm - m) * 60)
  return `${m}'${String(s).padStart(2, '0')}"`
}

function paceLabel(name: string) {
  return name === '자전거' ? 'km/h' : '페이스'
}

function haversineKm(a: RouteCoord, b: RouteCoord) {
  const R = 6371
  const dLat = (b.latitude - a.latitude) * Math.PI / 180
  const dLng = (b.longitude - a.longitude) * Math.PI / 180
  const sinLat = Math.sin(dLat / 2)
  const sinLng = Math.sin(dLng / 2)
  const c = sinLat * sinLat +
    Math.cos(a.latitude * Math.PI / 180) * Math.cos(b.latitude * Math.PI / 180) * sinLng * sinLng
  return R * 2 * Math.atan2(Math.sqrt(c), Math.sqrt(1 - c))
}

function routeDistanceKm(route: RouteCoord[]) {
  let total = 0
  for (let i = 1; i < route.length; i++) total += haversineKm(route[i - 1], route[i])
  return total
}

// ─── GPS Loading Pulse ────────────────────────────────────────────────────────

function GpsLoading() {
  const pulse = useRef(new Animated.Value(1)).current
  const opacity = useRef(new Animated.Value(0.6)).current

  useEffect(() => {
    Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(pulse,   { toValue: 1.6, duration: 1000, useNativeDriver: true }),
          Animated.timing(pulse,   { toValue: 1.0, duration: 1000, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(opacity, { toValue: 0.1, duration: 1000, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.6, duration: 1000, useNativeDriver: true }),
        ]),
      ])
    ).start()
  }, [])

  return (
    <View style={gps.wrap}>
      <View style={gps.mapArea}>
        <View style={gps.mapGrid}>
          {Array.from({ length: 7 }).map((_, i) => <View key={i} style={gps.gridLine} />)}
        </View>
        <View style={gps.mapGridH}>
          {Array.from({ length: 6 }).map((_, i) => <View key={i} style={gps.gridLineH} />)}
        </View>
        <View style={gps.dotWrap}>
          <Animated.View style={[gps.pulseShadow, { transform: [{ scale: pulse }], opacity }]} />
          <View style={gps.dot} />
        </View>
        <View style={gps.badge}>
          <View style={gps.badgeDot} />
          <Text style={gps.badgeText}>GPS 신호 잡는 중...</Text>
        </View>
      </View>
    </View>
  )
}

const gps = StyleSheet.create({
  wrap:      { width: SW - 40, marginBottom: 24, borderRadius: 20, overflow: 'hidden' },
  mapArea:   { height: Math.round(SH * 0.32), backgroundColor: '#1a2332', alignItems: 'center', justifyContent: 'center' },
  mapGrid:   { ...StyleSheet.absoluteFillObject, flexDirection: 'row', justifyContent: 'space-around', opacity: 0.07 },
  gridLine:  { width: 1, height: '100%', backgroundColor: '#fff' },
  mapGridH:  { ...StyleSheet.absoluteFillObject, flexDirection: 'column', justifyContent: 'space-around', opacity: 0.07 },
  gridLineH: { height: 1, width: '100%', backgroundColor: '#fff' },
  dotWrap:   { alignItems: 'center', justifyContent: 'center' },
  pulseShadow: { position: 'absolute', width: 40, height: 40, borderRadius: 20, backgroundColor: '#34C759' },
  dot:       { width: 14, height: 14, borderRadius: 7, backgroundColor: '#34C759', borderWidth: 2.5, borderColor: '#fff' },
  badge:     { position: 'absolute', bottom: 12, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  badgeDot:  { width: 6, height: 6, borderRadius: 3, backgroundColor: '#FF9500' },
  badgeText: { fontSize: 12, fontWeight: '600', color: '#fff' },
})


// ─── Ring Progress ────────────────────────────────────────────────────────────

function RingProgress({ progress }: { progress: number }) {
  const R = 80
  const stroke = 10
  const circumference = 2 * Math.PI * R
  const dashOffset = circumference * (1 - Math.min(progress, 1))
  return (
    <Svg width={190} height={190} style={{ transform: [{ rotate: '-90deg' }] }}>
      <Circle cx={95} cy={95} r={R} stroke="#F0F0F0" strokeWidth={stroke} fill="none" />
      <Circle
        cx={95} cy={95} r={R}
        stroke="#FF69B4" strokeWidth={stroke} fill="none"
        strokeDasharray={`${circumference}`}
        strokeDashoffset={dashOffset}
        strokeLinecap="round"
      />
    </Svg>
  )
}

// ─── Outdoor Tracker ──────────────────────────────────────────────────────────

function OutdoorTracker({ name, elapsed, plannedKm, kcal, route, started, paused, onStart, onPause, onStop }: {
  name: string; elapsed: number; plannedKm: number; kcal: number
  route: RouteCoord[]
  started: boolean; paused: boolean
  onStart: () => void; onPause: () => void; onStop: () => void
}) {
  const [mode, setMode] = useState<'outdoor' | 'indoor'>('outdoor')
  const actualKm = routeDistanceKm(route)
  const dist = actualKm > 0.01 ? actualKm.toFixed(2) : estimatedDistance(elapsed, name)
  const progress = Math.min(parseFloat(dist) / plannedKm, 1)

  return (
    <View style={out.root}>
      {/* 탭 */}
      <View style={out.tabBar}>
        {(['outdoor', 'indoor'] as const).map((m) => (
          <TouchableOpacity
            key={m}
            style={[out.tab, mode === m && out.tabActive]}
            onPress={() => setMode(m)}
            activeOpacity={0.8}
          >
            <Text style={[out.tabText, mode === m && out.tabTextActive]}>
              {m === 'outdoor' ? '야외 🗺️' : '실내 🏠'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={out.label}>{name.toUpperCase()}</Text>

      {mode === 'outdoor' && <GpsLoading />}
      {mode === 'indoor' && (
        <View style={out.ringWrap}>
          <RingProgress progress={progress} />
          <View style={out.ringCenter}>
            <Text style={out.ringDist}>{dist}</Text>
            <Text style={out.ringUnit}>/ {plannedKm} km</Text>
          </View>
        </View>
      )}

      <Text style={[out.time, paused && out.timePaused]}>{fmt(elapsed)}</Text>
      {started && paused && <Text style={out.pausedBadge}>⏸ 일시정지</Text>}

      <View style={out.progressBarWrap}>
        <View style={[out.progressBarFill, { width: `${progress * 100}%` as any }]} />
      </View>
      <Text style={out.progressText}>{dist} / {plannedKm} km</Text>

      <View style={out.statsCard}>
        <View style={out.stat}>
          <Text style={out.statVal}>{dist}</Text>
          <Text style={out.statLbl}>km</Text>
        </View>
        <View style={out.statDiv} />
        <View style={out.stat}>
          <Text style={out.statVal}>{kcal}</Text>
          <Text style={out.statLbl}>kcal</Text>
        </View>
        <View style={out.statDiv} />
        <View style={out.stat}>
          <Text style={out.statVal}>{paceOrSpeed(elapsed, name)}</Text>
          <Text style={out.statLbl}>{paceLabel(name)}</Text>
        </View>
      </View>

      {!started ? (
        <TouchableOpacity style={out.startBtn} onPress={onStart} activeOpacity={0.85}>
          <Text style={out.startText}>시작</Text>
        </TouchableOpacity>
      ) : (
        <View style={out.btnRow}>
          <TouchableOpacity style={out.pauseBtn} onPress={onPause} activeOpacity={0.8}>
            <Text style={out.pauseIcon}>{paused ? '▶' : '⏸'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={out.stopBtn} onPress={onStop} activeOpacity={0.85}>
            <View style={out.stopInner} />
          </TouchableOpacity>
        </View>
      )}
    </View>
  )
}

const out = StyleSheet.create({
  root:           { flex: 1, alignItems: 'center', backgroundColor: '#f8f8f8' },
  tabBar:         { flexDirection: 'row', marginTop: 4, marginBottom: 8, backgroundColor: '#efefef', borderRadius: 12, padding: 3, gap: 2 },
  tab:            { paddingHorizontal: 20, paddingVertical: 7, borderRadius: 10 },
  tabActive:      { backgroundColor: '#1a1a1a' },
  tabText:        { fontSize: 13, fontWeight: '600', color: '#999' },
  tabTextActive:  { color: '#fff' },
  label:          { fontSize: 12, fontWeight: '700', color: '#aaa', letterSpacing: 2, marginBottom: 12 },
  indoorSpacer:   { height: 32 },
  ringWrap:       { position: 'relative', alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  ringCenter:     { position: 'absolute', alignItems: 'center' },
  ringDist:       { fontSize: 36, fontWeight: '800', color: '#1a1a1a', letterSpacing: -1, fontVariant: ['tabular-nums'] },
  ringUnit:       { fontSize: 12, color: '#aaa', marginTop: 2 },
  time:           { fontSize: 76, fontWeight: '800', color: '#1a1a1a', letterSpacing: -2, fontVariant: ['tabular-nums'] },
  timePaused:     { opacity: 0.3 },
  pausedBadge:    { fontSize: 12, color: '#FF9500', fontWeight: '600', marginTop: 4, letterSpacing: 1 },
  progressBarWrap:{ width: SW - 80, height: 4, borderRadius: 2, backgroundColor: '#e5e5e5', marginTop: 20, overflow: 'hidden' },
  progressBarFill:{ height: 4, borderRadius: 2, backgroundColor: '#34C759' },
  progressText:   { fontSize: 12, color: '#aaa', marginTop: 6, marginBottom: 4 },
  statsCard:      { flexDirection: 'row', alignItems: 'center', width: SW - 48, backgroundColor: '#fff', borderRadius: 20, paddingVertical: 20, marginTop: 16,
                    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  stat:           { flex: 1, alignItems: 'center', gap: 4 },
  statDiv:        { width: 1, height: 36, backgroundColor: '#f0f0f0' },
  statVal:        { fontSize: 20, fontWeight: '700', color: '#1a1a1a', letterSpacing: -0.4 },
  statLbl:        { fontSize: 11, color: '#aaa' },
  startBtn:       { marginTop: 24, width: SW - 80, backgroundColor: '#1a1a1a', borderRadius: 16, paddingVertical: 18, alignItems: 'center' },
  startText:      { fontSize: 17, fontWeight: '700', color: '#fff' },
  btnRow:         { flexDirection: 'row', alignItems: 'center', gap: 24, marginTop: 24 },
  pauseBtn:       { width: 64, height: 64, borderRadius: 32, borderWidth: 2, borderColor: '#ddd', alignItems: 'center', justifyContent: 'center' },
  pauseIcon:      { fontSize: 24, color: '#555' },
  stopBtn:        { width: 72, height: 72, borderRadius: 36, borderWidth: 3, borderColor: '#FF4444', alignItems: 'center', justifyContent: 'center' },
  stopInner:      { width: 28, height: 28, borderRadius: 4, backgroundColor: '#FF4444' },
})

// ─── Count Tracker (줄넘기 / 계단오르기) ─────────────────────────────────────

const COUNT_INCREMENTS: Record<string, number[]> = {
  '회': [50, 100],
  '층': [1, 5],
}

function CountTracker({ name, emoji, remaining, plannedAmount, unit, elapsed, kcal, started, paused, onStart, onPause, onStop, onSubtract }: {
  name: string; emoji: string; remaining: number; plannedAmount: number; unit: string
  elapsed: number; kcal: number
  started: boolean; paused: boolean
  onStart: () => void; onPause: () => void; onStop: () => void; onSubtract: (n: number) => void
}) {
  const increments = COUNT_INCREMENTS[unit] ?? [1, 10]
  const progress = Math.min((plannedAmount - remaining) / plannedAmount, 1)
  const canLog = started && !paused

  return (
    <View style={cnt.root}>
      <Text style={cnt.emoji}>{emoji}</Text>
      <Text style={cnt.name}>{name}</Text>
      <View style={cnt.ringWrap}>
        <RingProgress progress={progress} />
        <View style={cnt.centerOverlay}>
          <Text style={cnt.countNum}>{remaining}</Text>
          <Text style={cnt.countUnit}>{unit} 남음</Text>
          {started && paused && <Text style={cnt.pausedBadge}>일시정지</Text>}
        </View>
      </View>
      <View style={cnt.metaRow}>
        <View style={cnt.metaItem}>
          <Text style={cnt.metaLbl}>소요 시간</Text>
          <Text style={cnt.metaVal}>{fmt(elapsed)}</Text>
        </View>
        <View style={cnt.metaDivider} />
        <View style={cnt.metaItem}>
          <Text style={cnt.metaLbl}>소모 칼로리</Text>
          <Text style={[cnt.metaVal, { color: '#FF69B4' }]}>{kcal} kcal</Text>
        </View>
      </View>
      <View style={cnt.incRow}>
        {increments.map((n) => (
          <TouchableOpacity
            key={n}
            style={[cnt.incBtn, !canLog && cnt.incBtnDisabled]}
            onPress={() => onSubtract(n)}
            activeOpacity={0.8}
            disabled={!canLog}
          >
            <Text style={cnt.incText}>+{n}{unit}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {!started ? (
        <TouchableOpacity style={cnt.startBtn} onPress={onStart} activeOpacity={0.85}>
          <Text style={cnt.startText}>시작</Text>
        </TouchableOpacity>
      ) : (
        <View style={cnt.btnRow}>
          <TouchableOpacity style={cnt.pauseBtn} onPress={onPause} activeOpacity={0.8}>
            <Text style={cnt.pauseText}>{paused ? '▶ 재개' : '⏸ 일시정지'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={cnt.stopBtn} onPress={onStop} activeOpacity={0.85}>
            <Text style={cnt.stopText}>종료</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  )
}

const cnt = StyleSheet.create({
  root:          { flex: 1, alignItems: 'center', paddingTop: 8 },
  emoji:         { fontSize: 40, marginBottom: 8 },
  name:          { fontSize: 20, fontWeight: '700', color: '#1a1a1a', marginBottom: 24, letterSpacing: -0.3 },
  ringWrap:      { position: 'relative', alignItems: 'center', justifyContent: 'center' },
  centerOverlay: { position: 'absolute', alignItems: 'center' },
  countNum:      { fontSize: 44, fontWeight: '800', color: '#1a1a1a', letterSpacing: -1, fontVariant: ['tabular-nums'] },
  countUnit:     { fontSize: 14, color: '#999', marginTop: 2 },
  pausedBadge:   { fontSize: 11, color: '#FF9500', fontWeight: '700', marginTop: 4 },
  metaRow:       { flexDirection: 'row', alignItems: 'center', marginTop: 24, width: SW - 80, backgroundColor: '#f4f4f4', borderRadius: 16, padding: 16 },
  metaItem:      { flex: 1, alignItems: 'center', gap: 4 },
  metaDivider:   { width: 1, height: 36, backgroundColor: '#e0e0e0' },
  metaLbl:       { fontSize: 11, color: '#999', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3 },
  metaVal:       { fontSize: 18, fontWeight: '700', color: '#1a1a1a', fontVariant: ['tabular-nums'] },
  incRow:        { flexDirection: 'row', gap: 12, marginTop: 20 },
  incBtn:        { backgroundColor: '#FF69B4', borderRadius: 14, paddingHorizontal: 28, paddingVertical: 16 },
  incBtnDisabled:{ opacity: 0.3 },
  incText:       { fontSize: 17, fontWeight: '700', color: '#fff' },
  startBtn:      { marginTop: 20, width: SW - 80, backgroundColor: '#1a1a1a', borderRadius: 16, paddingVertical: 18, alignItems: 'center' },
  startText:     { fontSize: 17, fontWeight: '700', color: '#fff' },
  btnRow:        { flexDirection: 'row', gap: 10, marginTop: 20, width: SW - 80 },
  pauseBtn:      { flex: 1, borderRadius: 14, paddingVertical: 14, alignItems: 'center', borderWidth: 1.5, borderColor: '#ddd' },
  pauseText:     { fontSize: 15, fontWeight: '600', color: '#555' },
  stopBtn:       { flex: 1, backgroundColor: '#1a1a1a', borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  stopText:      { fontSize: 15, fontWeight: '700', color: '#fff' },
})

// ─── Completion Screen ────────────────────────────────────────────────────────

// ─── Completion Screen ────────────────────────────────────────────────────────

function CompletionScreen({ name, elapsed, kcal, category, finalCount, unit, distanceKm, route, streak, goalPercent, dayNum, onHome }: {
  name: string; elapsed: number; kcal: number; category: string
  finalCount?: number; unit?: string; distanceKm?: number; route?: RouteCoord[]
  streak: number; goalPercent: number; dayNum: number; onHome: () => void
}) {
  const [shareOpen, setShareOpen] = useState(false)

  const shareData = { name, elapsed, kcal, distanceKm, route, streak, goalPercent, dayNum }

  const hasRoute = category === 'outdoor' && route && route.length > 1

  return (
    <ScrollView
      style={done.scroll}
      contentContainerStyle={done.root}
      showsVerticalScrollIndicator={false}
    >
      {/* Check */}
      <View style={done.checkCircle}>
        <Text style={done.checkMark}>✓</Text>
      </View>
      <Text style={done.title}>운동 완료!</Text>
      <Text style={done.sub}>{name}</Text>

      {/* Stats */}
      <View style={done.statsCard}>
        <View style={done.statCol}>
          <Text style={done.statVal}>{fmt(elapsed)}</Text>
          <Text style={done.statLbl}>시간</Text>
        </View>
        <View style={done.div} />
        <View style={done.statCol}>
          <Text style={[done.statVal, { color: colors.mint }]}>{kcal}</Text>
          <Text style={done.statLbl}>kcal</Text>
        </View>
        {category === 'outdoor' && distanceKm != null && (
          <>
            <View style={done.div} />
            <View style={done.statCol}>
              <Text style={done.statVal}>{distanceKm.toFixed(2)}</Text>
              <Text style={done.statLbl}>km</Text>
            </View>
          </>
        )}
        {category === 'indoor' && finalCount != null && (
          <>
            <View style={done.div} />
            <View style={done.statCol}>
              <Text style={done.statVal}>{finalCount}</Text>
              <Text style={done.statLbl}>{unit}</Text>
            </View>
          </>
        )}
      </View>

      {/* Streak + goal — text only */}
      <View style={done.badgeRow}>
        <Text style={done.badgeTxt}>🔥 {streak}일 연속</Text>
        <Text style={done.badgeSep}>·</Text>
        <Text style={done.badgeTxt}>목표 {Math.round(goalPercent)}% 달성</Text>
      </View>

      {/* CTA buttons */}
      <TouchableOpacity style={done.shareBtn} onPress={() => setShareOpen(true)} activeOpacity={0.85}>
        <Text style={done.shareBtnText}>📤  인증 카드 만들기</Text>
      </TouchableOpacity>
      <TouchableOpacity style={done.homeBtn} onPress={onHome} activeOpacity={0.85}>
        <Text style={done.homeBtnText}>홈으로 →</Text>
      </TouchableOpacity>

      <ShareStickerModal visible={shareOpen} data={shareData} onClose={() => setShareOpen(false)} />
    </ScrollView>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────


const done = StyleSheet.create({
  scroll:       { flex: 1, backgroundColor: '#f8f8f8' },
  root:         { alignItems: 'center', paddingHorizontal: 28, paddingTop: 40, paddingBottom: 40 },
  checkCircle:  { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.success, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  checkMark:    { fontSize: 34, color: '#fff', fontWeight: '300' },
  title:        { fontSize: 28, fontWeight: '800', color: colors.textPrimary, letterSpacing: -0.8, marginBottom: 4 },
  sub:          { fontSize: 15, color: colors.textTertiary, marginBottom: 20 },
  statsCard:    { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 20, padding: 22, width: '100%', marginBottom: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 3 },
  statCol:      { flex: 1, alignItems: 'center', gap: 4 },
  statVal:      { fontSize: 24, fontWeight: '800', color: colors.textPrimary, letterSpacing: -0.5 },
  statLbl:      { fontSize: 12, color: colors.textTertiary },
  div:          { width: 1, height: 38, backgroundColor: colors.borderSoft },
  badgeRow:     { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 28 },
  badgeTxt:     { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
  badgeSep:     { fontSize: 14, color: colors.textTertiary },
  shareBtn:     { width: '100%', backgroundColor: colors.textPrimary, borderRadius: 16, paddingVertical: 17, alignItems: 'center', marginBottom: 10 },
  shareBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  homeBtn:      { width: '100%', borderRadius: 16, paddingVertical: 14, alignItems: 'center', borderWidth: 1.5, borderColor: colors.borderSoft },
  homeBtnText:  { fontSize: 15, fontWeight: '600', color: colors.textTertiary },
})

// ─── Exercise Emoji Map ───────────────────────────────────────────────────────

const EXERCISE_EMOJI: Record<string, string> = {
  '러닝': '🏃',
  '파워워킹': '🚶',
  '자전거': '🚴',
  '줄넘기': '🪢',
  '계단오르기': '🪜',
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function ExerciseTrackerScreen() {
  const insets = useSafeAreaInsets()
  const { bodyInfo } = useAuthStore()
  const { addLog, logs } = useExerciseLogStore()

  const params = useLocalSearchParams<{
    name: string; plannedAmount: string; plannedUnit: string; plannedKcal: string; category: string
  }>()

  const name          = params.name ?? '운동'
  const category      = params.category ?? 'indoor'
  const plannedAmount = parseInt(params.plannedAmount ?? '20', 10)
  const plannedUnit   = params.plannedUnit ?? '회'
  const isOutdoor     = category === 'outdoor'

  const [phase,        setPhase]        = useState<Phase>('tracking')
  const [elapsed,      setElapsed]      = useState(0)
  const [paused,       setPaused]       = useState(false)
  const [started,      setStarted]      = useState(false)
  const [remaining,    setRemaining]    = useState(plannedAmount)
  const [route,        setRoute]        = useState<RouteCoord[]>([])
  const intervalRef     = useRef<ReturnType<typeof setInterval> | null>(null)

  // ─── Timer
  useEffect(() => {
    if (started && !paused) {
      intervalRef.current = setInterval(() => setElapsed((e) => e + 1), 1000)
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [paused, started])

  const handleStart    = () => setStarted(true)
  const handlePause    = () => setPaused((v) => !v)
  const handleSubtract = (n: number) => setRemaining((c) => Math.max(c - n, 0))

  const caloriesBurned = bodyInfo
    ? calculateExerciseCalories(
        isOutdoor ? 'walking' : 'cycling',
        Math.max(1, Math.floor(elapsed / 60)),
        bodyInfo.weight
      )
    : Math.round((elapsed / 60) * 6)

  const handleStop = () => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    const finalRoute = route
    const distKm = routeDistanceKm(finalRoute)
    if (bodyInfo) {
      addLog({
        id: Date.now().toString(),
        user_id: bodyInfo.user_id,
        date: getTodayString(),
        exercise: {
          id: name,
          name, name_ko: name,
          category: 'cardio',
          equipment: 'none', difficulty: 'beginner',
          primary_muscles: [], secondary_muscles: [], instructions: [],
        },
        duration_minutes: Math.max(1, Math.floor(elapsed / 60)),
        distance_km: isOutdoor ? distKm : undefined,
        calories_burned: caloriesBurned,
        route: isOutdoor && finalRoute.length > 0 ? finalRoute : undefined,
        created_at: new Date().toISOString(),
      })

      // 운동 완료 알림: 오늘 성과 + 내일 예고
      const todayStr = getTodayString()
      const { logs: dietLogs } = useDietStore.getState()
      const { goals } = useCoachStore.getState()
      const { logs: exLogs } = useExerciseLogStore.getState()
      const todayConsumed = dietLogs
        .filter((l) => l.date === todayStr)
        .reduce((s, l) => s + l.total_nutrition.calories, 0)
      const todayTotalBurned = exLogs
        .filter((l) => l.date === todayStr)
        .reduce((s, l) => s + (l.calories_burned ?? 0), 0) + caloriesBurned
      if (goals) {
        void sendExerciseCompletionSummary({
          exerciseName: name,
          burnedKcal: caloriesBurned,
          todayConsumedKcal: todayConsumed,
          calorieGoal: goals.calorieGoal,
          todayTotalBurnedKcal: todayTotalBurned,
          baseExerciseGoalKcal: goals.exerciseGoalKcal,
          tomorrowBaseExerciseKcal: goals.exerciseGoalKcal,
        })
      }
    }
    setPhase('done')
  }

  const handleHome = () => router.replace('/(tabs)')

  const emoji = EXERCISE_EMOJI[name] ?? '🏃'

  // ── streak: count consecutive days with at least one log ──────────────────
  const streak = (() => {
    const uniqueDates = [...new Set(logs.map((l) => l.date))].sort().reverse()
    let count = 0
    const d = new Date()
    for (const date of uniqueDates) {
      const expected = d.toISOString().slice(0, 10)
      if (date === expected) { count++; d.setDate(d.getDate() - 1) }
      else if (date < expected) break
    }
    // include today's just-completed workout
    const todayStr = getTodayString()
    if (count === 0 || uniqueDates[0] !== todayStr) count = Math.max(count, 1)
    return count
  })()

  // ── goal percent ──────────────────────────────────────────────────────────
  const distKmFinal = routeDistanceKm(route)
  const goalPercent = isOutdoor
    ? Math.min(100, (distKmFinal / plannedAmount) * 100)
    : Math.min(100, ((plannedAmount - remaining) / plannedAmount) * 100)

  // ── day number from log count ─────────────────────────────────────────────
  const dayNum = Math.max(1, new Set(logs.map((l) => l.date)).size)

  if (phase === 'done') {
    return (
      <View style={[main.root, { paddingTop: insets.top }]}>
        <CompletionScreen
          name={name} elapsed={elapsed} kcal={caloriesBurned} category={category}
          finalCount={plannedAmount - remaining} unit={plannedUnit}
          distanceKm={distKmFinal} route={route}
          streak={streak} goalPercent={goalPercent} dayNum={dayNum}
          onHome={handleHome}
        />
      </View>
    )
  }

  return (
    <View style={[main.root, { paddingTop: insets.top }]}>
      <TouchableOpacity style={main.back} onPress={() => router.back()} activeOpacity={0.7}>
        <Text style={main.backText}>← 나가기</Text>
      </TouchableOpacity>

      {isOutdoor ? (
        <OutdoorTracker
          name={name} elapsed={elapsed} plannedKm={plannedAmount}
          kcal={caloriesBurned} route={route}
          started={started} paused={paused}
          onStart={handleStart} onPause={handlePause} onStop={handleStop}
        />
      ) : (
        <CountTracker
          name={name} emoji={emoji} remaining={remaining}
          plannedAmount={plannedAmount} unit={plannedUnit}
          elapsed={elapsed} kcal={caloriesBurned}
          started={started} paused={paused}
          onStart={handleStart} onPause={handlePause} onStop={handleStop} onSubtract={handleSubtract}
        />
      )}
    </View>
  )
}

const main = StyleSheet.create({
  root:     { flex: 1, backgroundColor: '#f8f8f8' },
  back:     { paddingHorizontal: 20, paddingVertical: 12 },
  backText: { fontSize: 14, fontWeight: '600', color: '#888' },
})

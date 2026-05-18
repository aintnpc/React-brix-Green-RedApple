import { useState, useEffect, useRef } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity,
  Animated, Dimensions, ScrollView, Alert,
} from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { Svg, Circle } from 'react-native-svg'
import MapView, { Polyline, Marker, PROVIDER_DEFAULT } from 'react-native-maps'
import * as Location from 'expo-location'
import * as Crypto from 'expo-crypto'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { calculateExerciseCalories } from '@repo/shared'
import type { RouteCoord } from '@repo/shared'
import { useAuthStore } from '../store/auth'
import { t, isKorean } from '../lib/i18n'
import { kmToDisplay, distanceUnit } from '../lib/locale'
import { useExerciseLogStore } from '../store/exerciseLog'
import { getTodayString } from '@repo/shared'
import { colors } from '@repo/theme'
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
  return name === '자전거' ? 'km/h' : t('tracker_pace')
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
          <Text style={gps.badgeText}>{t('tracker_gps_loading')}</Text>
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

// ─── Live Route Map ───────────────────────────────────────────────────────────

function LiveRouteMap({ route, currentLocation, plannedKm, name }: {
  route: RouteCoord[]
  currentLocation: RouteCoord | null
  plannedKm: number
  name: string
}) {
  const mapRef     = useRef<MapView>(null)
  const [following, setFollowing] = useState(true)
  const actualKm   = routeDistanceKm(route)
  const unitSystem = useAuthStore.getState().unitSystem
  const dUnit      = distanceUnit(unitSystem)

  useEffect(() => {
    if (following && currentLocation && mapRef.current) {
      mapRef.current.animateCamera({
        center: { latitude: currentLocation.latitude, longitude: currentLocation.longitude },
        zoom: 16,
      }, { duration: 500 })
    }
  }, [currentLocation, following])

  const recenter = () => {
    setFollowing(true)
    if (currentLocation && mapRef.current) {
      mapRef.current.animateCamera({
        center: { latitude: currentLocation.latitude, longitude: currentLocation.longitude },
        zoom: 16,
      }, { duration: 400 })
    }
  }

  return (
    <View style={lm.wrap}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_DEFAULT}
        style={lm.map}
        initialRegion={currentLocation ? {
          latitude: currentLocation.latitude,
          longitude: currentLocation.longitude,
          latitudeDelta: 0.006,
          longitudeDelta: 0.006,
        } : undefined}
        showsUserLocation
        showsMyLocationButton={false}
        showsCompass={false}
        scrollEnabled
        zoomEnabled
        onPanDrag={() => setFollowing(false)}
      >
        {route.length > 1 && (
          <Polyline
            coordinates={route}
            strokeColor="#34C759"
            strokeWidth={5}
            lineCap="round"
            lineJoin="round"
          />
        )}
        {route.length > 0 && (
          <Marker coordinate={route[0]} anchor={{ x: 0.5, y: 0.5 }}>
            <View style={lm.startDot} />
          </Marker>
        )}
      </MapView>
      <View style={lm.distBadge}>
        <Text style={lm.distVal}>{kmToDisplay(actualKm, unitSystem).toFixed(2)}</Text>
        <Text style={lm.distUnit}> / {kmToDisplay(plannedKm, unitSystem)}{dUnit}</Text>
      </View>
      {!following && (
        <TouchableOpacity style={lm.recenterBtn} onPress={recenter} activeOpacity={0.8}>
          <Text style={lm.recenterTxt}>⊙</Text>
        </TouchableOpacity>
      )}
    </View>
  )
}

const lm = StyleSheet.create({
  wrap:         { width: SW - 40, height: Math.round(SH * 0.32), borderRadius: 20, overflow: 'hidden', marginBottom: 24 },
  map:          { flex: 1 },
  startDot:     { width: 12, height: 12, borderRadius: 6, backgroundColor: '#34C759', borderWidth: 2, borderColor: '#fff' },
  distBadge:    { position: 'absolute', bottom: 12, right: 12, flexDirection: 'row', alignItems: 'baseline', backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  distVal:      { fontSize: 14, fontWeight: '700', color: '#34C759' },
  distUnit:     { fontSize: 12, color: 'rgba(255,255,255,0.7)' },
  recenterBtn:  { position: 'absolute', bottom: 12, left: 12, width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.65)', alignItems: 'center', justifyContent: 'center' },
  recenterTxt:  { fontSize: 18, color: '#fff' },
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

function OutdoorTracker({ name, elapsed, plannedKm, kcal, route, currentLocation, started, paused, onStart, onPause, onStop }: {
  name: string; elapsed: number; plannedKm: number; kcal: number
  route: RouteCoord[]; currentLocation: RouteCoord | null
  started: boolean; paused: boolean
  onStart: () => void; onPause: () => void; onStop: () => void
}) {
  const [mode, setMode] = useState<'outdoor' | 'indoor'>('outdoor')
  const unitSystem = useAuthStore.getState().unitSystem
  const dUnit      = distanceUnit(unitSystem)
  const actualKm   = routeDistanceKm(route)
  const distRaw    = actualKm > 0.01 ? actualKm : parseFloat(estimatedDistance(elapsed, name))
  const dist       = kmToDisplay(distRaw, unitSystem).toFixed(2)
  const plannedDist = kmToDisplay(plannedKm, unitSystem)
  const progress   = Math.min(distRaw / plannedKm, 1)
  const gpsActive  = currentLocation !== null

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
              {m === 'outdoor' ? t('tracker_tab_outdoor') : t('tracker_tab_indoor')}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={out.label}>{name.toUpperCase()}</Text>

      {mode === 'outdoor' && (
        gpsActive
          ? <LiveRouteMap route={route} currentLocation={currentLocation} plannedKm={plannedKm} name={name} />
          : <GpsLoading />
      )}
      {mode === 'indoor' && (
        <View style={out.ringWrap}>
          <RingProgress progress={progress} />
          <View style={out.ringCenter}>
            <Text style={out.ringDist}>{dist}</Text>
            <Text style={out.ringUnit}>/ {plannedDist} {dUnit}</Text>
          </View>
        </View>
      )}

      <Text style={[out.time, paused && out.timePaused]}>{fmt(elapsed)}</Text>
      {started && paused && <Text style={out.pausedBadge}>{t('tracker_paused')}</Text>}

      <View style={out.progressBarWrap}>
        <View style={[out.progressBarFill, { width: `${progress * 100}%` as any }]} />
      </View>
      <Text style={out.progressText}>{dist} / {plannedDist} {dUnit}</Text>

      <View style={out.statsCard}>
        <View style={out.stat}>
          <Text style={out.statVal}>{dist}</Text>
          <Text style={out.statLbl}>{dUnit}</Text>
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
          <Text style={out.startText}>{t('tracker_start')}</Text>
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
  const displayUnit = unit === '분' ? t('home_unit_min') : unit
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
          <Text style={cnt.countUnit}>{t('tracker_count_remain', displayUnit)}</Text>
          {started && paused && <Text style={cnt.pausedBadge}>{t('tracker_paused')}</Text>}
        </View>
      </View>
      <View style={cnt.metaRow}>
        <View style={cnt.metaItem}>
          <Text style={cnt.metaLbl}>{t('tracker_elapsed')}</Text>
          <Text style={cnt.metaVal}>{fmt(elapsed)}</Text>
        </View>
        <View style={cnt.metaDivider} />
        <View style={cnt.metaItem}>
          <Text style={cnt.metaLbl}>{t('tracker_calories')}</Text>
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
            <Text style={cnt.incText}>+{n}{displayUnit}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {!started ? (
        <TouchableOpacity style={cnt.startBtn} onPress={onStart} activeOpacity={0.85}>
          <Text style={cnt.startText}>{t('tracker_start')}</Text>
        </TouchableOpacity>
      ) : (
        <View style={cnt.btnRow}>
          <TouchableOpacity style={cnt.pauseBtn} onPress={onPause} activeOpacity={0.8}>
            <Text style={cnt.pauseText}>{paused ? t('tracker_resume') : t('tracker_pause')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={cnt.stopBtn} onPress={onStop} activeOpacity={0.85}>
            <Text style={cnt.stopText}>{t('tracker_stop')}</Text>
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
  const unitSystem = useAuthStore.getState().unitSystem
  const dUnit      = distanceUnit(unitSystem)

  const shareData = { name, elapsed, kcal, distanceKm, route, streak, goalPercent, dayNum }

  const hasRoute = category === 'outdoor' && route && route.length > 1

  const region = hasRoute ? (() => {
    const lats = route!.map((c) => c.latitude)
    const lngs = route!.map((c) => c.longitude)
    const minLat = Math.min(...lats), maxLat = Math.max(...lats)
    const minLng = Math.min(...lngs), maxLng = Math.max(...lngs)
    return {
      latitude:      (minLat + maxLat) / 2,
      longitude:     (minLng + maxLng) / 2,
      latitudeDelta:  Math.max((maxLat - minLat) * 1.4, 0.005),
      longitudeDelta: Math.max((maxLng - minLng) * 1.4, 0.005),
    }
  })() : null

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
      <Text style={done.title}>{t('tracker_done_title')}</Text>
      <Text style={done.sub}>{name}</Text>

      {/* Route map — outdoor only */}
      {hasRoute && region && (
        <View style={done.mapWrap}>
          <MapView
            style={done.map}
            region={region}
            scrollEnabled={false}
            zoomEnabled={false}
            rotateEnabled={false}
            pitchEnabled={false}
            provider={PROVIDER_DEFAULT}
          >
            <Polyline
              coordinates={route!}
              strokeColor="#34C759"
              strokeWidth={5}
              lineCap="round"
              lineJoin="round"
            />
            <Marker coordinate={route![0]} anchor={{ x: 0.5, y: 0.5 }}>
              <View style={done.markerStart} />
            </Marker>
            <Marker coordinate={route![route!.length - 1]} anchor={{ x: 0.5, y: 0.5 }}>
              <View style={done.markerEnd} />
            </Marker>
          </MapView>
          {/* 거리 오버레이 */}
          <View style={done.mapBadge}>
            <Text style={done.mapBadgeTxt}>📍 {distanceKm != null ? kmToDisplay(distanceKm, unitSystem).toFixed(2) : ''} {dUnit}</Text>
          </View>
        </View>
      )}

      {/* Stats */}
      <View style={done.statsCard}>
        <View style={done.statCol}>
          <Text style={done.statVal}>{fmt(elapsed)}</Text>
          <Text style={done.statLbl}>{t('tracker_done_time_lbl')}</Text>
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
              <Text style={done.statVal}>{kmToDisplay(distanceKm, unitSystem).toFixed(2)}</Text>
              <Text style={done.statLbl}>{dUnit}</Text>
            </View>
          </>
        )}
        {category === 'indoor' && finalCount != null && (
          <>
            <View style={done.div} />
            <View style={done.statCol}>
              <Text style={done.statVal}>{finalCount}</Text>
              <Text style={done.statLbl}>{unit === '분' ? t('home_unit_min') : unit}</Text>
            </View>
          </>
        )}
      </View>

      {/* Streak + goal — text only */}
      <View style={done.badgeRow}>
        <Text style={done.badgeTxt}>{t('tracker_streak', streak)}</Text>
        <Text style={done.badgeSep}>·</Text>
        <Text style={done.badgeTxt}>{t('tracker_goal_pct', Math.round(goalPercent))}</Text>
      </View>

      {/* CTA buttons */}
      <TouchableOpacity style={done.shareBtn} onPress={() => setShareOpen(true)} activeOpacity={0.85}>
        <Text style={done.shareBtnText}>{t('tracker_share_card')}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={done.homeBtn} onPress={onHome} activeOpacity={0.85}>
        <Text style={done.homeBtnText}>{t('tracker_home')}</Text>
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
  mapWrap:      { width: '100%', height: 220, borderRadius: 20, overflow: 'hidden', marginBottom: 16, position: 'relative' },
  map:          { flex: 1 },
  mapBadge:     { position: 'absolute', bottom: 12, left: 12, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5 },
  mapBadgeTxt:  { fontSize: 13, fontWeight: '700', color: '#fff' },
  markerStart:  { width: 12, height: 12, borderRadius: 6, backgroundColor: '#34C759', borderWidth: 2, borderColor: '#fff' },
  markerEnd:    { width: 14, height: 14, borderRadius: 7, backgroundColor: '#FF3B30', borderWidth: 2, borderColor: '#fff' },
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
    name: string; nameEn: string; type: string; plannedAmount: string; plannedUnit: string; plannedKcal: string; category: string
  }>()

  const name          = (isKorean() ? params.name : (params.nameEn || params.name)) ?? '운동'
  const exerciseType  = params.type ?? (params.category === 'outdoor' ? 'running' : 'jumprope')
  const category      = params.category ?? 'indoor'
  const plannedAmount = parseInt(params.plannedAmount ?? '20', 10)
  const plannedUnit   = params.plannedUnit ?? '회'
  const isOutdoor     = category === 'outdoor'

  const [phase,        setPhase]        = useState<Phase>('tracking')
  const [elapsed,      setElapsed]      = useState(0)
  const [paused,       setPaused]       = useState(false)
  const [started,      setStarted]      = useState(false)
  const [exitModal,    setExitModal]    = useState(false)
  const [remaining,    setRemaining]    = useState(plannedAmount)
  const [route,        setRoute]        = useState<RouteCoord[]>([])
  const [currentLoc,   setCurrentLoc]   = useState<RouteCoord | null>(null)
  const [gpsTimeout,   setGpsTimeout]   = useState(false)
  const intervalRef     = useRef<ReturnType<typeof setInterval> | null>(null)
  const locationSubRef  = useRef<Location.LocationSubscription | null>(null)
  const gpsTimeoutRef   = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ─── Timer
  useEffect(() => {
    if (started && !paused) {
      intervalRef.current = setInterval(() => setElapsed((e) => e + 1), 1000)
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [paused, started])

  // ─── GPS tracking (outdoor only) — starts on mount, pauses when paused
  useEffect(() => {
    if (!isOutdoor) return
    if (started && paused) {
      locationSubRef.current?.remove()
      locationSubRef.current = null
      return
    }

    ;(async () => {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') {
        setGpsTimeout(true)
        return
      }

      // 15초 안에 첫 신호 없으면 타임아웃 처리
      gpsTimeoutRef.current = setTimeout(() => {
        if (!currentLoc) setGpsTimeout(true)
      }, 15000)

      locationSubRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          distanceInterval: 5,
          timeInterval: 2000,
        },
        (loc) => {
          if (gpsTimeoutRef.current) {
            clearTimeout(gpsTimeoutRef.current)
            gpsTimeoutRef.current = null
          }
          setGpsTimeout(false)
          const coord: RouteCoord = {
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
            timestamp: loc.timestamp,
          }
          setCurrentLoc(coord)
          if (started && !paused) setRoute((prev) => [...prev, coord])
        }
      )
    })()

    return () => {
      locationSubRef.current?.remove()
      locationSubRef.current = null
      if (gpsTimeoutRef.current) {
        clearTimeout(gpsTimeoutRef.current)
        gpsTimeoutRef.current = null
      }
    }
  }, [isOutdoor, started, paused])

  const handleStart    = () => setStarted(true)
  const handlePause    = () => setPaused((v) => !v)
  const handleSubtract = (n: number) => setRemaining((c) => Math.max(c - n, 0))

  const caloriesBurned = bodyInfo
    ? calculateExerciseCalories(
        exerciseType === 'jumprope' ? 'jump_rope' : exerciseType,
        Math.max(1, Math.floor(elapsed / 60)),
        bodyInfo.weight
      )
    : Math.round((elapsed / 60) * 6)

  const handleStop = () => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    locationSubRef.current?.remove()
    const finalRoute = route
    const distKm = routeDistanceKm(finalRoute)
    if (bodyInfo) {
      addLog({
        id: Crypto.randomUUID(),
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
      }).catch(() => {
        Alert.alert(t('tracker_save_fail'), t('tracker_save_fail_msg'))
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
      <TouchableOpacity style={main.back} onPress={() => setExitModal(true)} activeOpacity={0.7}>
        <Text style={main.backText}>{t('tracker_back')}</Text>
      </TouchableOpacity>

      {/* 나가기 확인 모달 */}
      {exitModal && (
        <View style={main.modalOverlay}>
          <View style={main.modalBox}>
            <Text style={main.modalEmoji}>🏃</Text>
            <Text style={main.modalTitle}>{t('tracker_exit_title')}</Text>
            <Text style={main.modalDesc}>
              {started
                ? t('tracker_exit_started', fmt(elapsed))
                : t('tracker_exit_msg')}
            </Text>
            <TouchableOpacity
              style={main.modalBtnPrimary}
              onPress={() => { setExitModal(false); router.back() }}
              activeOpacity={0.85}
            >
              <Text style={main.modalBtnPrimaryText}>{t('tracker_quit')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={main.modalBtnSecondary}
              onPress={() => setExitModal(false)}
              activeOpacity={0.85}
            >
              <Text style={main.modalBtnSecondaryText}>{t('tracker_continue')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {isOutdoor && gpsTimeout && (
        <View style={main.gpsBanner}>
          <Text style={main.gpsBannerText}>{t('tracker_gps_lost')}</Text>
          <TouchableOpacity onPress={() => setGpsTimeout(false)} activeOpacity={0.8}>
            <Text style={main.gpsBannerBtn}>{t('tracker_gps_wait')}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleStop} activeOpacity={0.8}>
            <Text style={main.gpsBannerBtn}>{t('tracker_gps_quit')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {isOutdoor ? (
        <OutdoorTracker
          name={name} elapsed={elapsed} plannedKm={plannedAmount}
          kcal={caloriesBurned} route={route} currentLocation={currentLoc}
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
  root:         { flex: 1, backgroundColor: '#f8f8f8' },
  back:         { paddingHorizontal: 20, paddingVertical: 12 },
  backText:     { fontSize: 14, fontWeight: '600', color: '#888' },
  gpsBanner:    { marginHorizontal: 20, marginBottom: 8, backgroundColor: '#fff3cd', borderRadius: 10, padding: 14, gap: 8 },
  gpsBannerText:{ fontSize: 14, fontWeight: '600', color: '#856404' },
  gpsBannerBtn: { fontSize: 13, fontWeight: '600', color: '#0a84ff', paddingVertical: 2 },
  modalOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  modalBox:     { width: SW - 56, backgroundColor: '#fff', borderRadius: 24, padding: 28, alignItems: 'center' },
  modalEmoji:   { fontSize: 40, marginBottom: 12 },
  modalTitle:   { fontSize: 20, fontWeight: '800', color: '#1a1a1a', letterSpacing: -0.4, marginBottom: 8 },
  modalDesc:    { fontSize: 14, color: '#888', textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  modalBtnPrimary:      { width: '100%', backgroundColor: '#FF3B30', borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginBottom: 10 },
  modalBtnPrimaryText:  { fontSize: 16, fontWeight: '700', color: '#fff' },
  modalBtnSecondary:    { width: '100%', backgroundColor: '#f2f2f2', borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  modalBtnSecondaryText:{ fontSize: 16, fontWeight: '600', color: '#1a1a1a' },
})

import React, { useState, useMemo, useRef } from 'react'
import { View, TouchableOpacity, Text, StyleSheet, PanResponder, Animated } from 'react-native'
import Body, { type ExtendedBodyPart, type Slug } from 'react-native-body-highlighter'
import { colorsDark as colors } from '@repo/theme'
import type { MuscleGroup } from '@repo/shared'

// exercises.json 근육명 → library slug 매핑
const MUSCLE_TO_SLUG: Partial<Record<MuscleGroup, Slug>> = {
  chest:      'chest',
  biceps:     'biceps',
  triceps:    'triceps',
  abs:        'abs',
  obliques:   'obliques',
  shoulders:  'deltoids',
  forearms:   'forearm',
  quads:      'quadriceps',
  hamstrings: 'hamstring',
  glutes:     'gluteal',
  calves:     'calves',
  traps:      'trapezius',
  lats:       'upper-back',
  lower_back: 'lower-back',
}

// intensity 1~4: 볼륨 구간 (세트 수 기준)
function setsToIntensity(sets: number): 1 | 2 | 3 | 4 {
  if (sets >= 12) return 4
  if (sets >= 7)  return 3
  if (sets >= 3)  return 2
  return 1
}

// 근육별 세트 수 맵 → ExtendedBodyPart 배열
export function buildHeatmapData(
  muscleSetMap: Partial<Record<MuscleGroup, number>>,
  mode: 'heatmap' | 'highlight' = 'heatmap',
): ExtendedBodyPart[] {
  return Object.entries(muscleSetMap)
    .filter(([, sets]) => sets > 0)
    .map(([muscle, sets]) => {
      const slug = MUSCLE_TO_SLUG[muscle as MuscleGroup]
      if (!slug) return null
      return {
        slug,
        intensity: mode === 'heatmap' ? setsToIntensity(sets) : 1,
      } satisfies ExtendedBodyPart
    })
    .filter(Boolean) as ExtendedBodyPart[]
}

// 앱 컬러 기반 intensity 팔레트 (1=약→4=강)
const HEATMAP_COLORS = ['#4A1515', '#7B1818', '#C42B2B', '#E83B3B'] as const

const MIN_SCALE = 1.0
const MAX_SCALE = 3.0

interface Props {
  muscleSetMap?: Partial<Record<MuscleGroup, number>>
  onMusclePress?: (muscle: MuscleGroup) => void
  selectedMuscle?: MuscleGroup | null
  scale?: number
  showToggle?: boolean
}

export function MuscleHeatmap({
  muscleSetMap = {},
  onMusclePress,
  selectedMuscle,
  scale: initialScale = 1.4,
  showToggle = true,
}: Props) {
  const [side, setSide] = useState<'front' | 'back'>('front')
  const [zoom, setZoom] = useState(1)
  const scaleAnim = useRef(new Animated.Value(1)).current

  // 핀치 줌 — 두 손가락 거리 추적
  const lastDistance = useRef<number | null>(null)
  const currentZoom = useRef(1)

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: (_, gs) => gs.numberActiveTouches === 2,
      onMoveShouldSetPanResponder: (_, gs) => gs.numberActiveTouches === 2,
      onPanResponderGrant: () => { lastDistance.current = null },
      onPanResponderMove: (e) => {
        const touches = e.nativeEvent.touches
        if (touches.length < 2) return
        const dx = touches[0].pageX - touches[1].pageX
        const dy = touches[0].pageY - touches[1].pageY
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (lastDistance.current !== null) {
          const delta = dist / lastDistance.current
          const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, currentZoom.current * delta))
          currentZoom.current = next
          scaleAnim.setValue(next)
          setZoom(next)
        }
        lastDistance.current = dist
      },
      onPanResponderRelease: () => { lastDistance.current = null },
    })
  ).current

  const data = useMemo(() => {
    const heatmap = buildHeatmapData(muscleSetMap)
    if (!selectedMuscle) return heatmap
    const slug = MUSCLE_TO_SLUG[selectedMuscle]
    if (!slug) return heatmap
    const filtered = heatmap.filter((d) => d.slug !== slug)
    return [...filtered, { slug, intensity: 4 } satisfies ExtendedBodyPart]
  }, [muscleSetMap, selectedMuscle])

  const BACK_SLUGS: Slug[] = ['upper-back', 'lower-back', 'gluteal', 'hamstring', 'trapezius']
  React.useEffect(() => {
    if (!selectedMuscle) return
    const slug = MUSCLE_TO_SLUG[selectedMuscle]
    if (!slug) return
    setSide(BACK_SLUGS.includes(slug) ? 'back' : 'front')
  }, [selectedMuscle])

  const handlePress = (part: ExtendedBodyPart) => {
    if (!onMusclePress || !part.slug) return
    const muscle = Object.entries(MUSCLE_TO_SLUG).find(([, s]) => s === part.slug)?.[0] as MuscleGroup | undefined
    if (muscle) onMusclePress(muscle)
  }

  const zoomPct = Math.round((zoom / 1) * 100)

  return (
    <View style={s.wrap}>
      {showToggle && (
        <View style={s.topRow}>
          {/* 확대율 표시 */}
          <View style={s.zoomBadge}>
            <Text style={s.zoomTxt}>{zoomPct}%</Text>
          </View>

          <View style={s.toggle}>
            <TouchableOpacity
              style={[s.toggleBtn, side === 'front' && s.toggleBtnActive]}
              onPress={() => setSide('front')}
            >
              <Text style={[s.toggleTxt, side === 'front' && s.toggleTxtActive]}>앞면</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.toggleBtn, side === 'back' && s.toggleBtnActive]}
              onPress={() => setSide('back')}
            >
              <Text style={[s.toggleTxt, side === 'back' && s.toggleTxtActive]}>뒷면</Text>
            </TouchableOpacity>
          </View>

          {/* 리셋 버튼 — 줌인 상태일 때만 */}
          <TouchableOpacity
            style={[s.resetBtn, zoom === 1 && s.resetBtnHidden]}
            onPress={() => {
              currentZoom.current = 1
              scaleAnim.setValue(1)
              setZoom(1)
            }}
            disabled={zoom === 1}
          >
            <Text style={s.resetTxt}>초기화</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={s.bodyWrap} {...panResponder.panHandlers}>
        <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
          <Body
            data={data}
            side={side}
            gender="male"
            scale={initialScale}
            colors={HEATMAP_COLORS}
            defaultFill="#2C2C2E"
            defaultStroke="#3C3C3E"
            defaultStrokeWidth={0.5}
            border="none"
            onBodyPartPress={onMusclePress ? handlePress : undefined}
          />
        </Animated.View>
      </View>

      {Object.keys(muscleSetMap).length > 0 && (
        <View style={s.legend}>
          <View style={s.legendGradient}>
            {HEATMAP_COLORS.map((c) => (
              <View key={c} style={[s.legendDot, { backgroundColor: c }]} />
            ))}
          </View>
          <View style={s.legendLabels}>
            <Text style={s.legendTxt}>적음</Text>
            <Text style={s.legendTxt}>많음</Text>
          </View>
        </View>
      )}
    </View>
  )
}

const s = StyleSheet.create({
  wrap:            { alignItems: 'center', gap: 12 },
  topRow:          { flexDirection: 'row', alignItems: 'center', width: '100%', paddingHorizontal: 4 },
  zoomBadge:       { backgroundColor: colors.background, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, minWidth: 48, alignItems: 'center' },
  zoomTxt:         { fontSize: 12, fontWeight: '700', color: colors.mint, fontVariant: ['tabular-nums'] },
  toggle:          { flex: 1, flexDirection: 'row', backgroundColor: colors.surface, borderRadius: 10, padding: 3, marginHorizontal: 8 },
  toggleBtn:       { flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: 8 },
  toggleBtnActive: { backgroundColor: colors.mint },
  toggleTxt:       { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  toggleTxtActive: { color: '#fff' },
  resetBtn:        { backgroundColor: colors.background, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, minWidth: 48, alignItems: 'center' },
  resetBtnHidden:  { opacity: 0 },
  resetTxt:        { fontSize: 12, fontWeight: '600', color: colors.textTertiary },
  bodyWrap:        { alignItems: 'center', overflow: 'hidden' },
  legend:          { alignItems: 'center', gap: 4 },
  legendGradient:  { flexDirection: 'row', gap: 4 },
  legendDot:       { width: 12, height: 12, borderRadius: 3 },
  legendLabels:    { flexDirection: 'row', justifyContent: 'space-between', width: 64 },
  legendTxt:       { fontSize: 10, color: colors.textTertiary },
})

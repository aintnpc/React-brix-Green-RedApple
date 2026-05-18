import { useRef, useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity, Modal,
  Animated, PanResponder, Image, ScrollView,
  Dimensions, Platform, Alert,
} from 'react-native'
import { Svg, Polyline as SvgPolyline, Circle } from 'react-native-svg'
import * as ImagePicker from 'expo-image-picker'
import ViewShot from 'react-native-view-shot'
import { Share } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors } from '@repo/theme'
import { t } from '../lib/i18n'
import { kmToDisplay, distanceUnit } from '../lib/locale'
import { useAuthStore } from '../store/auth'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ShareData {
  name: string
  elapsed: number
  kcal: number
  distanceKm?: number
  route?: { latitude: number; longitude: number }[]
  streak: number
  goalPercent: number
  dayNum: number
}

type StickerType = 'distance' | 'time' | 'kcal' | 'streak' | 'goal' | 'day' | 'route'

interface StickerItem {
  id: string
  type: StickerType
  scale: number
}

// ─── Constants ────────────────────────────────────────────────────────────────

const { width: SW } = Dimensions.get('window')
const CANVAS_W    = SW
const CANVAS_H    = SW * (4 / 3)
const GA_GREEN    = '#8BAC33'
const ROUTE_SIZE  = 150
const SNAP_GRID   = 40
const SNAP_THRESH = 16

function getPalette() {
  return [
    { type: 'distance' as StickerType, emoji: '📍', label: t('share_palette_distance') },
    { type: 'time'     as StickerType, emoji: '⏱',  label: t('share_palette_time') },
    { type: 'kcal'     as StickerType, emoji: '⚡',  label: t('share_palette_kcal') },
    { type: 'streak'   as StickerType, emoji: '🔥',  label: t('share_palette_streak') },
    { type: 'goal'     as StickerType, emoji: '📊',  label: t('share_palette_goal') },
    { type: 'day'      as StickerType, emoji: '🗓',  label: t('share_palette_challenge') },
    { type: 'route'    as StickerType, emoji: '🗺',  label: 'GPS' },
  ]
}

function fmt(sec: number) {
  const m = Math.floor(sec / 60), s = sec % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

// ─── Route Art ────────────────────────────────────────────────────────────────

function RouteArt({ route, size }: { route: NonNullable<ShareData['route']>; size: number }) {
  if (route.length < 2) return null
  const pad = 12
  const lats = route.map((c) => c.latitude)
  const lngs = route.map((c) => c.longitude)
  const minLat = Math.min(...lats), maxLat = Math.max(...lats)
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs)
  const rLat = maxLat - minLat || 0.001
  const rLng = maxLng - minLng || 0.001
  const sc   = Math.min((size - pad * 2) / rLng, (size - pad * 2) / rLat)
  const offX = (size - rLng * sc) / 2
  const offY = (size - rLat * sc) / 2
  const toX  = (lng: number) => offX + (lng - minLng) * sc
  const toY  = (lat: number) => offY + (1 - (lat - minLat) / rLat) * rLat * sc
  const pts  = route.map((c) => `${toX(c.longitude).toFixed(1)},${toY(c.latitude).toFixed(1)}`).join(' ')
  const ex   = toX(route[route.length - 1].longitude)
  const ey   = toY(route[route.length - 1].latitude)
  return (
    <Svg width={size} height={size}>
      <SvgPolyline points={pts} fill="none" stroke={GA_GREEN} strokeWidth={3.5}
        strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx={ex} cy={ey} r={6}  fill={GA_GREEN} />
      <Circle cx={ex} cy={ey} r={13} fill={GA_GREEN} opacity={0.22} />
    </Svg>
  )
}

// ─── GPS + Brand sticker ──────────────────────────────────────────────────────
// "GREEN APPLE" label is draggable inside via nested PanResponder.
// It lives entirely inside the 150×150 bounds so iOS touch clipping isn't an issue.
// onResponderTerminationRequest: false prevents the outer sticker pan from stealing.

function RouteWithBrandSticker({
  data, selected, onSelect,
}: { data: ShareData; selected: boolean; onSelect: () => void }) {
  const brandPan = useRef(new Animated.ValueXY({ x: 8, y: ROUTE_SIZE - 28 })).current

  const brandResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder:  () => true,   // bubble — innermost wins
    onMoveShouldSetPanResponder:   () => true,
    onResponderTerminationRequest: () => false,  // don't let parent steal
    onPanResponderGrant: () => {
      onSelect()   // touching brand label also selects the sticker
      brandPan.setOffset({ x: (brandPan.x as any)._value, y: (brandPan.y as any)._value })
      brandPan.setValue({ x: 0, y: 0 })
    },
    onPanResponderMove: Animated.event(
      [null, { dx: brandPan.x, dy: brandPan.y }],
      { useNativeDriver: false }
    ),
    onPanResponderRelease: () => { brandPan.flattenOffset() },
  })).current

  return (
    <View style={[rw.card, selected && rw.cardSel]}>
      <View style={rw.mapArea}>
        {data.route && data.route.length > 1
          ? <RouteArt route={data.route} size={ROUTE_SIZE} />
          : <View style={rw.noGps}><Text style={rw.noGpsTxt}>{t('tracker_gps_none')}</Text></View>
        }
      </View>
      {/* Draggable brand label — completely inside card bounds */}
      <Animated.View
        style={[rw.brandLabel, { left: brandPan.x, top: brandPan.y }]}
        {...brandResponder.panHandlers}
      >
        <Text style={rw.brandTxt}>GREEN APPLE</Text>
      </Animated.View>
    </View>
  )
}

const rw = StyleSheet.create({
  card:      { width: ROUTE_SIZE, height: ROUTE_SIZE, borderRadius: 20, overflow: 'hidden' },
  cardSel:   { borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.5)', borderStyle: 'dashed' as const },
  mapArea:   { width: ROUTE_SIZE, height: ROUTE_SIZE },
  noGps:     { flex: 1, alignItems: 'center', justifyContent: 'center' },
  noGpsTxt:  { color: 'rgba(255,255,255,0.3)', fontSize: 12 },
  brandLabel:{ position: 'absolute' },
  brandTxt:  { fontSize: 10, fontWeight: '800', color: GA_GREEN, letterSpacing: 1.6 },
})

// ─── Stat sticker face (no background) ───────────────────────────────────────

function getStickerContent(type: StickerType, data: ShareData) {
  switch (type) {
    case 'distance': return { label: 'DISTANCE', value: data.distanceKm?.toFixed(2) ?? '--', unit: 'km' }
    case 'time':     return { label: 'TIME',      value: fmt(data.elapsed) }
    case 'kcal':     return { label: 'KCAL',      value: String(data.kcal),                 unit: 'kcal' }
    case 'streak':   return { label: 'STREAK',    value: String(data.streak),               unit: t('share_sticker_streak_unit') }
    case 'goal':     return { label: 'GOAL',       value: `${Math.round(data.goalPercent)}`, unit: '%' }
    case 'day':      return { label: 'CHALLENGE',  value: `D+${data.dayNum}` }
    default:         return { label: '', value: '' }
  }
}

function StickerFace({
  type, data, selected, onSelect, scale,
}: { type: StickerType; data: ShareData; selected: boolean; onSelect: () => void; scale: number }) {
  const s = scale
  if (type === 'route') {
    return (
      <View style={{ transform: [{ scale }] }}>
        <RouteWithBrandSticker data={data} selected={selected} onSelect={onSelect} />
      </View>
    )
  }
  const { label, value, unit } = getStickerContent(type, data)
  return (
    <View style={[sf.wrap, selected && sf.wrapSel]}>
      <Text style={[sf.label, { fontSize: 10 * s }]}>{label}</Text>
      <Text style={[sf.value, { fontSize: 46 * s, lineHeight: 52 * s }]}>{value}</Text>
      {unit ? <Text style={[sf.unit, { fontSize: 13 * s }]}>{unit}</Text> : null}
    </View>
  )
}

const sf = StyleSheet.create({
  wrap:      { alignItems: 'flex-start', paddingHorizontal: 4, paddingVertical: 4 },
  wrapSel:   { borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.55)', borderStyle: 'dashed' as const, borderRadius: 12 },
  label:     { fontWeight: '700', color: 'rgba(255,255,255,0.5)', letterSpacing: 1.5, marginBottom: 0 },
  value:     { fontWeight: '800', color: '#FFFFFF', letterSpacing: -2 },
  unit:      { fontWeight: '500', color: 'rgba(255,255,255,0.65)', marginTop: 1 },
})

// ─── Draggable Sticker ────────────────────────────────────────────────────────
//
// Single PanResponder handles both move and resize via touch-zone detection.
// onPanResponderGrant checks locationX/Y against the sticker's measured size:
//   • bottom-right RESIZE_ZONE px → resize (scale via diagonal drag)
//   • everywhere else            → move + snap-to-grid
//
// This avoids nested PanResponder conflicts AND the iOS touch-clipping issue
// that breaks handles positioned outside parent view bounds (bottom:-14, right:-14).

function DraggableSticker({
  sticker, data, selected, onSelect, onRemove, onScaleChange, initialX, initialY,
}: {
  sticker: StickerItem
  data: ShareData
  selected: boolean
  onSelect: () => void
  onRemove: () => void
  onScaleChange: (scale: number) => void
  initialX: number
  initialY: number
}) {
  const [pos, setPos]   = useState({ x: initialX, y: initialY })
  const curPos          = useRef({ x: initialX, y: initialY })
  const basePos         = useRef({ x: initialX, y: initialY })
  const onSelectRef     = useRef(onSelect)
  onSelectRef.current   = onSelect
  curPos.current        = pos

  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder:  () => true,

    onPanResponderGrant: () => {
      basePos.current = { x: curPos.current.x, y: curPos.current.y }
      onSelectRef.current()
    },

    onPanResponderMove: (_, g) => {
      setPos({ x: basePos.current.x + g.dx, y: basePos.current.y + g.dy })
    },

    onPanResponderRelease: (_, g) => {
      const cx = basePos.current.x + g.dx
      const cy = basePos.current.y + g.dy
      const nx = Math.round(cx / SNAP_GRID) * SNAP_GRID
      const ny = Math.round(cy / SNAP_GRID) * SNAP_GRID
      const sx = Math.abs(cx - nx) < SNAP_THRESH ? nx : cx
      const sy = Math.abs(cy - ny) < SNAP_THRESH ? ny : cy
      setPos({ x: sx, y: sy })
    },
  })).current

  const baseScale      = useRef(sticker.scale)
  const scaleRef       = useRef(sticker.scale)
  const onScaleRef     = useRef(onScaleChange)
  scaleRef.current     = sticker.scale
  onScaleRef.current   = onScaleChange

  const resizeResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder:     () => true,
    onMoveShouldSetPanResponder:      () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: () => {
      baseScale.current = scaleRef.current
    },
    onPanResponderMove: (_, g) => {
      const delta = (g.dx + g.dy) / 120
      const next  = Math.max(0.4, Math.min(3.0, baseScale.current + delta))
      onScaleRef.current(next)
    },
  })).current

  return (
    <View
      style={[ds.sticker, { left: pos.x, top: pos.y }]}
      {...panResponder.panHandlers}
    >
      <StickerFace type={sticker.type} data={data} selected={selected} onSelect={onSelect} scale={sticker.scale} />

      {selected && (
        <TouchableOpacity
          style={ds.removeBtn}
          onPress={onRemove}
          hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
        >
          <Text style={ds.removeTxt}>✕</Text>
        </TouchableOpacity>
      )}

      {selected && (
        <View style={ds.resizeHandle} {...resizeResponder.panHandlers}>
          <Text style={ds.resizeTxt}>⤡</Text>
        </View>
      )}
    </View>
  )
}

const ds = StyleSheet.create({
  sticker:      { position: 'absolute' },
  removeBtn: {
    position: 'absolute', top: 2, right: 2,
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: '#FF3B30',
    alignItems: 'center', justifyContent: 'center',
    zIndex: 10,
  },
  removeTxt:    { fontSize: 9, fontWeight: '800', color: '#fff' },
  resizeHandle: {
    position: 'absolute', bottom: 2, right: 2,
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.5)',
    alignItems: 'center', justifyContent: 'center',
    zIndex: 10,
  },
  resizeTxt:    { fontSize: 12, color: '#fff' },
})

// ─── Sticker Canvas ───────────────────────────────────────────────────────────

function StickerCanvas({
  data, photoUri, stickers, selectedId, onSelect, onRemove, onScaleChange, shotRef,
}: {
  data: ShareData
  photoUri?: string
  stickers: StickerItem[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  onRemove: (id: string) => void
  onScaleChange: (id: string, scale: number) => void
  shotRef: React.RefObject<ViewShot | null>
}) {
  const positions = useRef<Record<string, { x: number; y: number }>>({})
  const getInitial = (id: string) => {
    if (!positions.current[id]) {
      positions.current[id] = {
        x: 24 + Math.random() * (CANVAS_W - 200),
        y: 48 + Math.random() * (CANVAS_H * 0.4),
      }
    }
    return positions.current[id]
  }

  return (
    <ViewShot ref={shotRef as any} options={{ format: 'png', quality: 1 }}
      style={{ width: CANVAS_W, flex: 1 }}>
      {photoUri
        ? <Image source={{ uri: photoUri }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
        : <View style={[StyleSheet.absoluteFillObject, { backgroundColor: '#0C0C10' }]} />
      }
      <TouchableOpacity
        style={StyleSheet.absoluteFillObject}
        activeOpacity={1}
        onPress={() => onSelect(null)}
        accessible={false}
      />
      {stickers.map((s) => {
        const pos = getInitial(s.id)
        return (
          <DraggableSticker
            key={s.id}
            sticker={s}
            data={data}
            selected={selectedId === s.id}
            onSelect={() => onSelect(s.id)}
            onRemove={() => onRemove(s.id)}
            onScaleChange={(scale) => onScaleChange(s.id, scale)}
            initialX={pos.x}
            initialY={pos.y}
          />
        )
      })}
    </ViewShot>
  )
}

// ─── Palette ──────────────────────────────────────────────────────────────────

function PaletteSheet({ onAdd }: { onAdd: (type: StickerType) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}
      style={ps.scroll} contentContainerStyle={ps.row}>
      {getPalette().map((item) => (
        <TouchableOpacity key={item.type} style={ps.chip} onPress={() => onAdd(item.type)} activeOpacity={0.7}>
          <Text style={ps.emoji}>{item.emoji}</Text>
          <Text style={ps.label}>{item.label}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  )
}

const ps = StyleSheet.create({
  scroll: { flexGrow: 0 },
  row:    { paddingHorizontal: 16, paddingVertical: 12, gap: 10 },
  chip:   {
    width: 70, height: 72, borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.borderSoft,
    alignItems: 'center', justifyContent: 'center', gap: 5,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 2,
  },
  emoji:  { fontSize: 22 },
  label:  { fontSize: 10, fontWeight: '600', color: colors.textSecondary },
})

// ─── Tool button ──────────────────────────────────────────────────────────────

function ToolBtn({ emoji, label, onPress }: { emoji: string; label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={tb.btn} onPress={onPress} activeOpacity={0.7}>
      <Text style={tb.emoji}>{emoji}</Text>
      <Text style={tb.label}>{label}</Text>
    </TouchableOpacity>
  )
}
const tb = StyleSheet.create({
  btn:   { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.background, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: colors.borderSoft },
  emoji: { fontSize: 14 },
  label: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
})

// ─── Main Modal ───────────────────────────────────────────────────────────────

export function ShareStickerModal({ visible, data, onClose }: {
  visible: boolean
  data: ShareData
  onClose: () => void
}) {
  const insets  = useSafeAreaInsets()
  const shotRef = useRef<ViewShot>(null)

  const [photoUri,   setPhotoUri]   = useState<string | undefined>()
  const [stickers,   setStickers]   = useState<StickerItem[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const hasSelected = selectedId != null && stickers.some((s) => s.id === selectedId)

  const addSticker = useCallback((type: StickerType) => {
    const id = `${type}_${Date.now()}`
    setStickers((prev) => [...prev, { id, type, scale: 1.0 }])
    setSelectedId(id)
  }, [])

  const removeSticker = useCallback((id: string) => {
    setStickers((prev) => prev.filter((s) => s.id !== id))
    setSelectedId(null)
  }, [])

  const updateScale = useCallback((id: string, scale: number) => {
    setStickers((prev) => prev.map((s) => s.id === id ? { ...s, scale } : s))
  }, [])

  const pickPhoto = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.95 })
    if (!res.canceled) setPhotoUri(res.assets[0].uri)
  }

  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync()
    if (perm.status !== 'granted') { Alert.alert(t('share_camera_perm')); return }
    const res = await ImagePicker.launchCameraAsync({ quality: 0.95 })
    if (!res.canceled) setPhotoUri(res.assets[0].uri)
  }

  const handleShare = async () => {
    try {
      setSelectedId(null)
      await new Promise((r) => setTimeout(r, 90))
      const uri = await shotRef.current?.capture?.()
      if (!uri) return
      const result = await Share.share(
        Platform.OS === 'ios'
          ? { url: uri, message: '#GreenApple #workout #fitness' }
          : { message: `#GreenApple #workout #fitness\n${uri}` }
      )
      if (result.action !== Share.dismissedAction) {
        onClose()
      }
    } catch {
      Alert.alert(t('share_title'), t('paywall_err_unknown'))
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={[m.root, { paddingTop: insets.top }]}>

        {/* ── Nav bar ── */}
        <View style={m.nav}>
          <TouchableOpacity onPress={onClose} activeOpacity={0.7} style={m.navSide}>
            <Text style={m.navClose}>{t('share_cancel')}</Text>
          </TouchableOpacity>
          <Text style={m.navTitle}>{t('share_title')}</Text>
          <View style={[m.navSide, { alignItems: 'flex-end' }]}>
            <TouchableOpacity style={m.shareBtn} onPress={handleShare} activeOpacity={0.82}>
              <Text style={m.shareTxt}>{t('share_btn')}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Canvas ── */}
        <View style={{ width: CANVAS_W, flex: 1 }}>
          <StickerCanvas
            data={data} photoUri={photoUri} stickers={stickers}
            selectedId={selectedId} onSelect={setSelectedId}
            onRemove={removeSticker} onScaleChange={updateScale}
            shotRef={shotRef as any}
          />
        </View>

        {/* ── Bottom sheet ── */}
        <View style={[m.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={m.handle} />
          <View style={m.toolRow}>
            <ToolBtn emoji="🖼" label={t('share_pick_photo')} onPress={pickPhoto} />
            <ToolBtn emoji="📷" label={t('share_take_photo')} onPress={takePhoto} />
            {stickers.length > 0 && (
              <ToolBtn emoji="🗑" label={t('share_clear_all')} onPress={() => { setStickers([]); setSelectedId(null) }} />
            )}
          </View>
          <PaletteSheet onAdd={addSticker} />
        </View>

      </View>
    </Modal>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const m = StyleSheet.create({
  root:     { flex: 1, backgroundColor: colors.background },
  nav:      {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSoft,
  },
  navSide:  { minWidth: 80 },
  navClose: { fontSize: 16, color: GA_GREEN },
  navTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', color: colors.textPrimary, letterSpacing: -0.3 },
  shareBtn: { backgroundColor: GA_GREEN, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 8 },
  shareTxt: { fontSize: 14, fontWeight: '700', color: '#fff' },
  sheet:    { backgroundColor: colors.surface, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderSoft, width: '100%' },
  handle:   { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.borderSoft, alignSelf: 'center', marginTop: 8, marginBottom: 2 },
  toolRow:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 10, paddingBottom: 2, gap: 8 },
})

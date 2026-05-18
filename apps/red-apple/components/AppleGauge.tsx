import { useEffect, useRef } from 'react'
import { View, StyleSheet, Animated } from 'react-native'
import { SvgXml } from 'react-native-svg'
import { APPLE_1, APPLE_2, APPLE_3, APPLE_4, APPLE_5 } from './AppleSvgs'

const STAGES = [APPLE_1, APPLE_2, APPLE_3, APPLE_4, APPLE_5]

function stageIndex(score: number): number {
  if (score <= 20) return 0
  if (score <= 40) return 1
  if (score <= 60) return 2
  if (score <= 80) return 3
  return 4
}

interface Props {
  score: number
  size?: number
  animKey?: number
}

export function AppleGauge({ score, size = 110, animKey }: Props) {
  const height = Math.round(size * (197 / 150))
  const idx    = stageIndex(score)

  const opacities = useRef(
    STAGES.map((_, i) => new Animated.Value(i === 0 ? 1 : 0))
  ).current

  useEffect(() => {
    // Reset to APPLE_1 (bare apple)
    opacities.forEach((a, i) => a.setValue(i === 0 ? 1 : 0))

    if (idx === 0) return

    // Fill up from stage 0 → idx, one bite at a time
    const seq: Animated.CompositeAnimation[] = []
    for (let from = 0; from < idx; from++) {
      const to = from + 1
      seq.push(
        Animated.parallel([
          Animated.timing(opacities[from], { toValue: 0, duration: 200, useNativeDriver: true }),
          Animated.timing(opacities[to],   { toValue: 1, duration: 200, useNativeDriver: true }),
        ])
      )
      seq.push(Animated.delay(100))
    }
    Animated.sequence(seq).start()
  }, [idx, animKey])

  return (
    <View style={[styles.appleWrap, { width: size, height }]}>
      {STAGES.map((svg, i) => (
        <Animated.View
          key={i}
          style={[StyleSheet.absoluteFill, { opacity: opacities[i] }]}
        >
          <SvgXml xml={svg} width={size} height={height} />
        </Animated.View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  appleWrap: { position: 'relative' },
})

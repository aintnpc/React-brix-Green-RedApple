import React from 'react'
import Svg, { Path, G, Ellipse } from 'react-native-svg'
import type { MuscleGroup } from '@repo/shared'

interface Props {
  selected?: MuscleGroup | null
  highlighted?: MuscleGroup[]
  onSelect: (muscle: MuscleGroup) => void
}

const MUSCLE_COLOR = {
  default: '#2C2C2E',
  selected: '#E83B3B',
  highlighted: '#C42B2B',
  body: '#1C1C1E',
}

export function MuscleBackMap({ selected, highlighted = [], onSelect }: Props) {
  const getColor = (muscle: MuscleGroup) => {
    if (muscle === selected) return MUSCLE_COLOR.selected
    if (highlighted.includes(muscle)) return MUSCLE_COLOR.highlighted
    return MUSCLE_COLOR.default
  }

  return (
    <Svg width="200" height="380" viewBox="0 0 200 380">
      {/* 머리 */}
      <Ellipse cx="100" cy="30" rx="22" ry="26" fill="#2C2C2E" />

      {/* 목 */}
      <Path d="M88 54 L112 54 L108 70 L92 70 Z" fill="#2C2C2E" />

      {/* 승모근 (traps) */}
      <G onPress={() => onSelect('traps')}>
        <Path d="M78 65 L100 75 L122 65 L126 85 L100 90 L74 85 Z" fill={getColor('traps')} />
      </G>

      {/* 어깨 뒷면 (shoulders) */}
      <G onPress={() => onSelect('shoulders')}>
        <Ellipse cx="68" cy="84" rx="18" ry="14" fill={getColor('shoulders')} />
        <Ellipse cx="132" cy="84" rx="18" ry="14" fill={getColor('shoulders')} />
      </G>

      {/* 광배근 (lats) */}
      <G onPress={() => onSelect('lats')}>
        <Path d="M74 88 L94 96 L90 140 L72 130 Z" fill={getColor('lats')} />
        <Path d="M106 96 L126 88 L128 130 L110 140 Z" fill={getColor('lats')} />
      </G>

      {/* 삼두 (triceps) */}
      <G onPress={() => onSelect('triceps')}>
        <Path d="M56 88 L68 86 L70 118 L58 120 Z" fill={getColor('triceps')} />
        <Path d="M132 86 L144 88 L142 120 L130 118 Z" fill={getColor('triceps')} />
      </G>

      {/* 하배부 (lower_back) */}
      <G onPress={() => onSelect('lower_back')}>
        <Path d="M86 140 L114 140 L116 160 L84 160 Z" fill={getColor('lower_back')} />
      </G>

      {/* 둔근 (glutes) */}
      <G onPress={() => onSelect('glutes')}>
        <Path d="M84 160 L116 160 L118 200 L82 200 Z" fill={getColor('glutes')} />
      </G>

      {/* 햄스트링 (hamstrings) */}
      <G onPress={() => onSelect('hamstrings')}>
        <Path d="M84 202 L99 202 L97 265 L81 262 Z" fill={getColor('hamstrings')} />
        <Path d="M101 202 L116 202 L119 262 L103 265 Z" fill={getColor('hamstrings')} />
      </G>

      {/* 종아리 뒷면 (calves) */}
      <G onPress={() => onSelect('calves')}>
        <Path d="M82 268 L97 265 L95 320 L80 318 Z" fill={getColor('calves')} />
        <Path d="M103 265 L118 268 L120 318 L105 320 Z" fill={getColor('calves')} />
      </G>
    </Svg>
  )
}

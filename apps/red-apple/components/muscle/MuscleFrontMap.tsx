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

export function MuscleFrontMap({ selected, highlighted = [], onSelect }: Props) {
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

      {/* 어깨 (deltoids) */}
      <G onPress={() => onSelect('shoulders')}>
        <Ellipse cx="68" cy="80" rx="18" ry="14" fill={getColor('shoulders')} />
        <Ellipse cx="132" cy="80" rx="18" ry="14" fill={getColor('shoulders')} />
      </G>

      {/* 가슴 (chest) */}
      <G onPress={() => onSelect('chest')}>
        <Path d="M86 72 L100 78 L114 72 L120 95 L100 100 L80 95 Z" fill={getColor('chest')} />
      </G>

      {/* 이두 (biceps) */}
      <G onPress={() => onSelect('biceps')}>
        <Path d="M58 86 L68 84 L72 115 L60 118 Z" fill={getColor('biceps')} />
        <Path d="M132 84 L142 86 L140 118 L128 115 Z" fill={getColor('biceps')} />
      </G>

      {/* 복근 (abs) */}
      <G onPress={() => onSelect('abs')}>
        <Path d="M88 100 L112 100 L114 145 L86 145 Z" fill={getColor('abs')} />
      </G>

      {/* 전완 (forearms) */}
      <G onPress={() => onSelect('forearms')}>
        <Path d="M57 118 L68 116 L66 148 L54 146 Z" fill={getColor('forearms')} />
        <Path d="M132 116 L143 118 L146 146 L134 148 Z" fill={getColor('forearms')} />
      </G>

      {/* 외복사근 (obliques) */}
      <G onPress={() => onSelect('obliques')}>
        <Path d="M80 105 L88 103 L86 145 L76 140 Z" fill={getColor('obliques')} />
        <Path d="M112 103 L120 105 L124 140 L114 145 Z" fill={getColor('obliques')} />
      </G>

      {/* 대퇴사두 (quads) */}
      <G onPress={() => onSelect('quads')}>
        <Path d="M86 148 L100 150 L98 220 L82 218 Z" fill={getColor('quads')} />
        <Path d="M100 150 L114 148 L118 218 L102 220 Z" fill={getColor('quads')} />
      </G>

      {/* 종아리 (calves) */}
      <G onPress={() => onSelect('calves')}>
        <Path d="M83 225 L97 223 L95 285 L80 282 Z" fill={getColor('calves')} />
        <Path d="M103 223 L117 225 L120 282 L105 285 Z" fill={getColor('calves')} />
      </G>
    </Svg>
  )
}

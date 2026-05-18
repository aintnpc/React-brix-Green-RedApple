import React from 'react'
import { View, StyleSheet, ViewStyle } from 'react-native'
import { colors, borderRadius } from '@repo/theme'

interface ProgressBarProps {
  value: number       // 0 ~ 1
  color?: string
  trackColor?: string
  height?: number
  style?: ViewStyle
  animated?: boolean
}

export function ProgressBar({
  value,
  color = colors.accent,
  trackColor = colors.backgroundTertiary,
  height = 8,
  style,
}: ProgressBarProps) {
  const clampedValue = Math.min(Math.max(value, 0), 1)

  return (
    <View style={[styles.track, { backgroundColor: trackColor, height }, style]}>
      <View
        style={[
          styles.fill,
          {
            backgroundColor: color,
            width: `${clampedValue * 100}%`,
            height,
          },
        ]}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  track: {
    width: '100%',
    borderRadius: borderRadius.full,
    overflow: 'hidden',
  },
  fill: {
    borderRadius: borderRadius.full,
  },
})

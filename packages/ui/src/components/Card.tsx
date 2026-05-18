import React from 'react'
import { View, TouchableOpacity, StyleSheet, StyleProp, ViewStyle } from 'react-native'
import { colors, spacing, borderRadius } from '@repo/theme'

interface CardProps {
  children: React.ReactNode
  onPress?: () => void
  style?: StyleProp<ViewStyle>
  padding?: keyof typeof spacing
}

export function Card({ children, onPress, style, padding = 4 }: CardProps) {
  if (onPress) {
    return (
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.7}
        style={[styles.card, { padding: spacing[padding] }, style]}
      >
        {children}
      </TouchableOpacity>
    )
  }

  return (
    <View style={[styles.card, { padding: spacing[padding] }, style]}>
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.borderLight,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
})

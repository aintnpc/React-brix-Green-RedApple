import React from 'react'
import { Text as RNText, StyleSheet, TextStyle, TextProps } from 'react-native'
import { colors, fontSizes, fontWeights } from '@repo/theme'

type Variant = 'h1' | 'h2' | 'h3' | 'h4' | 'body' | 'bodySmall' | 'caption' | 'label'
type Color = 'primary' | 'secondary' | 'tertiary' | 'inverse' | 'accent' | 'error' | 'success'

interface Props extends TextProps {
  variant?: Variant
  color?: Color
  style?: TextStyle
  children: React.ReactNode
}

export function Text({ variant = 'body', color = 'primary', style, children, ...props }: Props) {
  return (
    <RNText
      style={[styles[variant], styles[`color_${color}`], style]}
      {...props}
    >
      {children}
    </RNText>
  )
}

const styles = StyleSheet.create({
  h1: { fontSize: fontSizes['3xl'], fontWeight: fontWeights.bold, lineHeight: fontSizes['3xl'] * 1.2 },
  h2: { fontSize: fontSizes['2xl'], fontWeight: fontWeights.bold, lineHeight: fontSizes['2xl'] * 1.2 },
  h3: { fontSize: fontSizes.xl, fontWeight: fontWeights.semibold, lineHeight: fontSizes.xl * 1.3 },
  h4: { fontSize: fontSizes.lg, fontWeight: fontWeights.semibold, lineHeight: fontSizes.lg * 1.3 },
  body: { fontSize: fontSizes.md, fontWeight: fontWeights.regular, lineHeight: fontSizes.md * 1.5 },
  bodySmall: { fontSize: fontSizes.sm, fontWeight: fontWeights.regular, lineHeight: fontSizes.sm * 1.5 },
  caption: { fontSize: fontSizes.xs, fontWeight: fontWeights.regular, lineHeight: fontSizes.xs * 1.4 },
  label: { fontSize: fontSizes.sm, fontWeight: fontWeights.medium, lineHeight: fontSizes.sm * 1.4 },

  color_primary: { color: colors.textPrimary },
  color_secondary: { color: colors.textSecondary },
  color_tertiary: { color: colors.textTertiary },
  color_inverse: { color: colors.textInverse },
  color_accent: { color: colors.accent },
  color_error: { color: colors.error },
  color_success: { color: colors.success },
})

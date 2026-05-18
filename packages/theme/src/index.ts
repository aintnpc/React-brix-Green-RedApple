export * from './colors'
export * from './typography'
export * from './spacing'

import { colors } from './colors'
import { fontSizes, fontWeights, lineHeights } from './typography'
import { spacing, borderRadius } from './spacing'

export const theme = {
  colors,
  fontSizes,
  fontWeights,
  lineHeights,
  spacing,
  borderRadius,
} as const

export type Theme = typeof theme

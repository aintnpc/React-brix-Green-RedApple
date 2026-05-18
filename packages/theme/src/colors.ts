// Green Apple (light theme)
export const colorsLight = {
  // Brand — green apple
  mint:       '#B2D64A',
  mintDeep:   '#8BAC33',
  mintLight:  '#F3FAD4',

  // Activity Rings
  ringCalorie:  '#FF6B6B',
  ringExercise: '#30D158',
  ringStreak:   '#5E5CE6',

  // Neutral
  primary: '#1C1C1E',
  primaryLight: '#3A3A3C',

  // Accent
  accent: '#B2D64A',
  accentLight: '#F3FAD4',

  // Background
  background:          '#F5F5F7',
  backgroundSecondary: '#F5F5F7',
  backgroundTertiary:  '#EBEBEB',

  // Surface
  surface:         '#FFFFFF',
  surfaceDeep:     '#FAFAFB',
  surfaceSecondary:'#FFFFFF',

  // Text
  textPrimary:   '#1C1C1E',
  textSecondary: '#636366',
  textTertiary:  '#AEAEB2',
  textInverse:   '#FFFFFF',

  // Macro
  macroCarb:    '#FFB340',
  macroProtein: '#64D2FF',
  macroFat:     '#BF5AF2',

  // Status
  success:      '#30D158',
  successLight: '#DCFCE7',
  warning:      '#FF9500',
  warningLight: '#FEF3C7',
  error:        '#FF3B30',
  errorLight:   '#FEE2E2',
  info:         '#64D2FF',
  infoLight:    '#E8F4FD',

  // Border
  border:      '#E5E5EA',
  borderSoft:  '#EFEFF2',
  borderLight: '#EFEFF2',

  // Transparent
  transparent: 'transparent',
} as const

// Red Apple (dark theme)
export const colorsDark = {
  // Brand — red apple
  mint:       '#E83B3B',
  mintDeep:   '#C42B2B',
  mintLight:  '#2A1212',

  // Activity Rings
  ringCalorie:  '#FF6B6B',
  ringExercise: '#30D158',
  ringStreak:   '#5E5CE6',

  // Neutral
  primary: '#F5F5F7',
  primaryLight: '#AEAEB2',

  // Accent
  accent:      '#E83B3B',
  accentLight: '#2A1212',

  // Background
  background:          '#0A0A0A',
  backgroundSecondary: '#111111',
  backgroundTertiary:  '#1C1C1E',

  // Surface
  surface:         '#1C1C1E',
  surfaceDeep:     '#141414',
  surfaceSecondary:'#242424',

  // Text
  textPrimary:   '#F5F5F7',
  textSecondary: '#AEAEB2',
  textTertiary:  '#636366',
  textInverse:   '#0A0A0A',

  // Macro
  macroCarb:    '#FFB340',
  macroProtein: '#64D2FF',
  macroFat:     '#BF5AF2',

  // Status
  success:      '#30D158',
  successLight: '#0D2E1A',
  warning:      '#FF9500',
  warningLight: '#2E1F00',
  error:        '#FF453A',
  errorLight:   '#2E0F0F',
  info:         '#64D2FF',
  infoLight:    '#0D1E2E',

  // Border
  border:      '#2C2C2E',
  borderSoft:  '#242424',
  borderLight: '#242424',

  // Transparent
  transparent: 'transparent',
} as const

// Default export = Green Apple (backward compat — green-apple imports this)
export const colors = colorsLight

export type ColorToken = keyof typeof colorsLight

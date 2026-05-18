import { getLocales } from 'expo-localization'

export type UnitSystem = 'metric' | 'imperial'

export function getRegionCode(): string {
  try {
    return getLocales()[0]?.regionCode ?? 'KR'
  } catch {
    return 'KR'
  }
}

// 야드파운드법 사용 국가
const IMPERIAL_REGIONS = new Set(['US', 'GB', 'CA', 'AU', 'NZ'])

export function getDefaultUnitSystem(): UnitSystem {
  return IMPERIAL_REGIONS.has(getRegionCode()) ? 'imperial' : 'metric'
}

// ─── 단위 변환 ──────────────────────────────────────────────────────────────

export function kgToLb(kg: number): number {
  return Math.round(kg * 2.2046 * 10) / 10
}

export function lbToKg(lb: number): number {
  return Math.round((lb / 2.2046) * 10) / 10
}

export function cmToFtIn(cm: number): { ft: number; inch: number } {
  const totalInches = cm / 2.54
  const ft = Math.floor(totalInches / 12)
  const inch = Math.round(totalInches % 12)
  return { ft, inch }
}

export function ftInToCm(ft: number, inch: number): number {
  return Math.round((ft * 12 + inch) * 2.54)
}

// ─── 표시용 포맷 ──────────────────────────────────────────────────────────────

export function formatWeight(kg: number, unit: UnitSystem): string {
  if (unit === 'imperial') return `${kgToLb(kg)} lb`
  return `${kg} kg`
}

export function formatHeight(cm: number, unit: UnitSystem): string {
  if (unit === 'imperial') {
    const { ft, inch } = cmToFtIn(cm)
    return `${ft}'${inch}"`
  }
  return `${cm} cm`
}

export function formatWeightNum(kg: number, unit: UnitSystem): string {
  if (unit === 'imperial') return String(kgToLb(kg))
  return String(kg)
}

export function weightUnit(unit: UnitSystem): string {
  return unit === 'imperial' ? 'lb' : 'kg'
}

export function heightUnit(unit: UnitSystem): string {
  return unit === 'imperial' ? 'ft / in' : 'cm'
}

// 표시값 → 내부 kg 변환 (입력값 처리)
export function displayToKg(value: number, unit: UnitSystem): number {
  return unit === 'imperial' ? lbToKg(value) : value
}

// 내부 kg → 표시값
export function kgToDisplay(kg: number, unit: UnitSystem): number {
  return unit === 'imperial' ? kgToLb(kg) : kg
}

export function kmToDisplay(km: number, unit: UnitSystem): number {
  return unit === 'imperial' ? Math.round(km * 0.621371 * 10) / 10 : km
}

export function distanceUnit(unit: UnitSystem): string {
  return unit === 'imperial' ? 'mi' : 'km'
}

// cm → 표시값 (imperial: 총 inch로 슬라이더 사용, 표시는 ft'in")
export function cmToDisplayInch(cm: number): number {
  return Math.round(cm / 2.54)
}

export function inchToCm(inch: number): number {
  return Math.round(inch * 2.54)
}

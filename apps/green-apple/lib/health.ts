import { Platform } from 'react-native'

import { NativeModules } from 'react-native'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Constants } = require('react-native-health')
const AppleHealthKit = NativeModules.AppleHealthKit

const PERMISSIONS = {
  permissions: {
    read: [Constants.Permissions.StepCount],
    write: [],
  },
}

let initialized = false

// HealthKit 권한 요청 (온보딩에서 명시적으로 호출)
export async function requestHealthKitPermission(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false

  return new Promise((resolve) => {
    AppleHealthKit.initHealthKit(PERMISSIONS, (err: Error) => {
      if (err) { resolve(false); return }
      initialized = true
      resolve(true)
    })
  })
}

// 이미 권한이 있으면 조용히 초기화 (홈 진입 시)
async function ensureInitialized(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false
  if (initialized) return true

  return new Promise((resolve) => {
    AppleHealthKit.initHealthKit(PERMISSIONS, (err: Error) => {
      if (err) {
        console.warn('[HealthKit] ensureInitialized err:', err)
        resolve(false); return
      }
      initialized = true
      resolve(true)
    })
  })
}

export async function getTodaySteps(): Promise<number> {
  const ok = await ensureInitialized()
  if (!ok) return 0

  const startOfDay = new Date()
  startOfDay.setHours(0, 0, 0, 0)

  return new Promise((resolve) => {
    AppleHealthKit.getStepCount(
      { date: startOfDay.toISOString() },
      (err: Error, result: { value: number }) => {
        if (err) { resolve(0); return }
        resolve(Math.round(result.value ?? 0))
      }
    )
  })
}

export async function diagnoseHealthKit(): Promise<string> {
  if (Platform.OS !== 'ios') return '❌ iOS only'

  const lines: string[] = []
  lines.push(`initialized flag: ${initialized}`)

  const initOk = await new Promise<boolean>((resolve) => {
    AppleHealthKit.initHealthKit(PERMISSIONS, (err: Error, result: unknown) => {
      lines.push(`initHealthKit err: ${err ? JSON.stringify(err) : 'none'}`)
      lines.push(`initHealthKit result: ${JSON.stringify(result)}`)
      if (!err) initialized = true
      resolve(!err)
    })
  })

  if (!initOk) return lines.join('\n')

  await new Promise<void>((resolve) => {
    const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0)
    AppleHealthKit.getStepCount(
      { date: startOfDay.toISOString() },
      (err: Error, result: { value: number }) => {
        lines.push(`getStepCount err: ${err ? JSON.stringify(err) : 'none'}`)
        lines.push(`getStepCount result: ${JSON.stringify(result)}`)
        resolve()
      }
    )
  })

  return lines.join('\n')
}

// 날짜 범위 내 날짜별 걸음 수 반환 (과거 누적 계산용)
// startDate, endDate: 'YYYY-MM-DD'
export async function getStepsByDateRange(
  startDate: string,
  endDate: string,
): Promise<Record<string, number>> {
  const ok = await ensureInitialized()
  if (!ok) return {}

  return new Promise((resolve) => {
    AppleHealthKit.getDailyStepCountSamples(
      {
        startDate: new Date(startDate).toISOString(),
        endDate:   new Date(endDate + 'T23:59:59').toISOString(),
      },
      (err: Error, results: { startDate: string; value: number }[]) => {
        if (err || !results) { resolve({}); return }

        const byDate: Record<string, number> = {}
        for (const r of results) {
          const date = r.startDate.slice(0, 10)
          byDate[date] = Math.round((byDate[date] ?? 0) + r.value)
        }
        resolve(byDate)
      }
    )
  })
}

// 걸음 수 → 칼로리 (ACSM 공식 근사: 체중 × 0.0005 kcal/걸음)
export function stepsToKcal(steps: number, weightKg: number): number {
  return Math.round(steps * weightKg * 0.0005)
}

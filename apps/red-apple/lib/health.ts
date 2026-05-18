// TODO: Red Apple 전용 HealthKit 설정 필요
export async function requestHealthKitPermission(): Promise<boolean> { return false }
export async function getTodaySteps(): Promise<number> { return 0 }
export async function getStepsByDateRange(_start: string, _end: string): Promise<Record<string, number>> { return {} }
export function stepsToKcal(_steps: number, _weightKg: number): number { return 0 }

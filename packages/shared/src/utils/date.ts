export function getTodayString(): string {
  return new Date().toLocaleDateString('en-CA')
}

export function formatDate(dateString: string, locale = 'ko-KR'): string {
  return new Date(dateString).toLocaleDateString(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export function formatDateShort(dateString: string): string {
  const date = new Date(dateString)
  const month = date.getMonth() + 1
  const day = date.getDate()
  return `${month}/${day}`
}

export function getDayOfWeek(dateString: string): string {
  const days = ['일', '월', '화', '수', '목', '금', '토']
  return days[new Date(dateString).getDay()]
}

export function getLastNDays(n: number): string[] {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (n - 1 - i))
    return d.toLocaleDateString('en-CA')
  })
}

/** First puzzle date, used to compute the sequential puzzle number. */
export const GAME_EPOCH = '2026-01-01'

function toUtcDate(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00Z`)
}

export function todayDateString(): string {
  return dateToDateString(new Date())
}

export function dateToDateString(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function puzzleNumberForDate(dateStr: string): number {
  const ms = toUtcDate(dateStr).getTime() - toUtcDate(GAME_EPOCH).getTime()
  return Math.floor(ms / 86_400_000) + 1
}

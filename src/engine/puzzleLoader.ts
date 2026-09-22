import type { CategoryId, Puzzle } from './types'
import { todayDateString } from './dailyIndex'

const base = import.meta.env.BASE_URL

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(path)
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`)
  return res.json() as Promise<T>
}

/** Dates (YYYY-MM-DD, ascending) for which a puzzle exists in this category. */
export async function loadAvailableDates(category: CategoryId): Promise<string[]> {
  return fetchJson<string[]>(`${base}puzzles/${category}/index.json`)
}

export async function loadPuzzle(category: CategoryId, date: string): Promise<Puzzle> {
  return fetchJson<Puzzle>(`${base}puzzles/${category}/${date}.json`)
}

/**
 * Loads today's puzzle. If today's file isn't published yet (generation runs
 * on a schedule), falls back to the most recent available date so the game
 * never shows a hard error.
 */
export async function loadTodaysPuzzle(category: CategoryId): Promise<Puzzle> {
  const dates = await loadAvailableDates(category)
  if (dates.length === 0) throw new Error(`No puzzles published for ${category} yet`)
  const today = todayDateString()
  const date = dates.includes(today) ? today : [...dates].sort().filter((d) => d <= today).pop() ?? dates[0]
  return loadPuzzle(category, date)
}

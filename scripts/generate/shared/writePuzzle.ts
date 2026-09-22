import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { CategoryId, Puzzle } from '../../../src/engine/types'
import { puzzleNumberForDate } from '../../../src/engine/dailyIndex'

export const PUZZLES_ROOT = join(import.meta.dirname, '..', '..', '..', 'public', 'puzzles')

export function writePuzzle(puzzle: Omit<Puzzle, 'number'>): void {
  const dir = join(PUZZLES_ROOT, puzzle.category)
  mkdirSync(dir, { recursive: true })

  const full: Puzzle = { ...puzzle, number: puzzleNumberForDate(puzzle.date) }
  if (full.extras && Object.keys(full.extras).length === 0) delete full.extras
  writeFileSync(join(dir, `${puzzle.date}.json`), JSON.stringify(full) + '\n')

  const indexPath = join(dir, 'index.json')
  const dates: string[] = existsSync(indexPath) ? JSON.parse(readFileSync(indexPath, 'utf-8')) : []
  if (!dates.includes(puzzle.date)) dates.push(puzzle.date)
  dates.sort()
  writeFileSync(indexPath, JSON.stringify(dates, null, 2) + '\n')

  const extrasCount = Object.values(full.extras ?? {}).reduce((n, list) => n + list.length, 0)
  console.log(
    `  ${puzzle.date}${puzzle.tag ? ` [${puzzle.tag}]` : ''}: ${full.nodes[puzzle.start].name} → ${full.nodes[puzzle.end].name}, ` +
      `${puzzle.parMoves / 2} links (${Object.keys(full.nodes).length} nodes, ${extrasCount} extra names)`,
  )
}

export function existingPuzzleDates(category: CategoryId): string[] {
  const indexPath = join(PUZZLES_ROOT, category, 'index.json')
  return existsSync(indexPath) ? JSON.parse(readFileSync(indexPath, 'utf-8')) : []
}

export function readPuzzle(category: CategoryId, date: string): Puzzle | null {
  const path = join(PUZZLES_ROOT, category, `${date}.json`)
  return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf-8')) as Puzzle) : null
}

/**
 * The date to start generating from: the day after the latest already-published
 * puzzle, or today if none exist yet. Keeps scheduled runs additive — they
 * extend the calendar forward instead of re-rolling (and silently changing)
 * puzzles that may already be public.
 */
export function nextStartDate(category: CategoryId): string {
  const dates = existingPuzzleDates(category)
  const today = new Date().toISOString().slice(0, 10)
  if (dates.length === 0) return today
  const d = new Date(`${[...dates].sort().at(-1)}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  const next = d.toISOString().slice(0, 10)
  return next > today ? next : today
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

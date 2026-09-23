import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { CategoryId } from '../../../src/engine/types'
import type { PuzzleFile } from '../../../src/engine/graphFormat'
import { puzzleNumberForDate } from '../../../src/engine/dailyIndex'

export const PUZZLES_ROOT = join(import.meta.dirname, '..', '..', '..', 'public', 'puzzles')

/** Only the fields every puzzle file has had, in both the old (bundled graph) and new format. */
export interface StoredPuzzle {
  date: string
  start: string
  end: string
  tag?: string
  graph?: string
}

function indexPath(category: CategoryId): string {
  return join(PUZZLES_ROOT, category, 'index.json')
}

function writeIndex(category: CategoryId, dates: string[]) {
  writeFileSync(indexPath(category), JSON.stringify([...new Set(dates)].sort(), null, 2) + '\n')
}

export function writePuzzle(puzzle: Omit<PuzzleFile, 'number'>, note = ''): void {
  const dir = join(PUZZLES_ROOT, puzzle.category)
  mkdirSync(dir, { recursive: true })
  const file: PuzzleFile = { ...puzzle, number: puzzleNumberForDate(puzzle.date) }
  writeFileSync(join(dir, `${puzzle.date}.json`), JSON.stringify(file, null, 2) + '\n')
  writeIndex(puzzle.category, [...existingPuzzleDates(puzzle.category), puzzle.date])
  if (note) console.log(`  ${puzzle.date}${puzzle.tag ? ` [${puzzle.tag}]` : ''}: ${note}`)
}

export function removePuzzle(category: CategoryId, date: string): void {
  rmSync(join(PUZZLES_ROOT, category, `${date}.json`), { force: true })
  writeIndex(category, existingPuzzleDates(category).filter((d) => d !== date))
}

export function existingPuzzleDates(category: CategoryId): string[] {
  return existsSync(indexPath(category)) ? JSON.parse(readFileSync(indexPath(category), 'utf-8')) : []
}

export function readPuzzle(category: CategoryId, date: string): StoredPuzzle | null {
  const path = join(PUZZLES_ROOT, category, `${date}.json`)
  return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf-8')) as StoredPuzzle) : null
}

/**
 * The date to start generating from: the day after the latest already-published
 * puzzle, or today if none exist yet. Keeps scheduled runs additive — they
 * extend the calendar forward instead of re-rolling (and silently changing)
 * puzzles that may already be public.
 */
export function nextStartDate(category: CategoryId): string {
  const dates = existingPuzzleDates(category)
  const today = todayUtc()
  if (dates.length === 0) return today
  const next = addDays([...dates].sort().at(-1)!, 1)
  return next > today ? next : today
}

export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10)
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

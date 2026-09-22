import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { CategoryId, Puzzle, PuzzleEdge, PuzzleNode } from '../../../src/engine/types'
import { puzzleNumberForDate } from '../../../src/engine/dailyIndex'

const PUZZLES_ROOT = join(import.meta.dirname, '..', '..', '..', 'public', 'puzzles')

export function writePuzzle(params: {
  category: CategoryId
  date: string
  start: string
  end: string
  nodes: Record<string, PuzzleNode>
  edges: PuzzleEdge[]
  parMoves: number
}): void {
  const dir = join(PUZZLES_ROOT, params.category)
  mkdirSync(dir, { recursive: true })

  const puzzle: Puzzle = {
    date: params.date,
    category: params.category,
    number: puzzleNumberForDate(params.date),
    start: params.start,
    end: params.end,
    nodes: params.nodes,
    edges: params.edges,
    parMoves: params.parMoves,
  }

  writeFileSync(join(dir, `${params.date}.json`), JSON.stringify(puzzle, null, 2) + '\n')

  const indexPath = join(dir, 'index.json')
  const existing: string[] = existsSync(indexPath) ? JSON.parse(readFileSync(indexPath, 'utf-8')) : []
  if (!existing.includes(params.date)) existing.push(params.date)
  existing.sort()
  writeFileSync(indexPath, JSON.stringify(existing, null, 2) + '\n')

  console.log(
    `Wrote ${params.category}/${params.date}.json ` +
      `(${Object.keys(params.nodes).length} nodes, ${params.edges.length} edges, par ${params.parMoves})`,
  )
}

export function alreadyHasPuzzle(category: CategoryId, date: string): boolean {
  return existsSync(join(PUZZLES_ROOT, category, `${date}.json`))
}

export function existingPuzzleDates(category: CategoryId): string[] {
  const indexPath = join(PUZZLES_ROOT, category, 'index.json')
  return existsSync(indexPath) ? JSON.parse(readFileSync(indexPath, 'utf-8')) : []
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
  const maxDate = [...dates].sort().at(-1)!
  const d = new Date(`${maxDate}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  const next = d.toISOString().slice(0, 10)
  return next > today ? next : today
}

/** Start/end pairs already used, so regeneration doesn't repeat a puzzle. */
export function usedPairs(category: CategoryId): Set<string> {
  const set = new Set<string>()
  for (const date of existingPuzzleDates(category)) {
    const path = join(PUZZLES_ROOT, category, `${date}.json`)
    if (!existsSync(path)) continue
    const puzzle = JSON.parse(readFileSync(path, 'utf-8')) as Puzzle
    const key = puzzle.start < puzzle.end ? `${puzzle.start}|${puzzle.end}` : `${puzzle.end}|${puzzle.start}`
    set.add(key)
  }
  return set
}

import type { CategoryId, PuzzleEdge } from '../../../src/engine/types'
import { buildPuzzleGraph, pairKey, pickPuzzlePair, type RawNode } from './graph'
import { addDays, existingPuzzleDates, nextStartDate, readPuzzle, writePuzzle } from './writePuzzle'

export interface GraphContext {
  nodes: Record<string, RawNode>
  edges: PuzzleEdge[]
  /** Who may be a puzzle's start/end — a notability floor so nobody obscure is the answer. */
  isEndpoint: (id: string) => boolean
  tag?: string
  /** Real-world neighbor names beyond the crawled graph (e.g. an actor's full filmography). */
  extraNames?: Map<string, string[]>
}

export function parseArgs(): { count: number; startDate?: string } {
  const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1]
  return { count: Number(arg('count') ?? 30), startDate: arg('start-date') }
}

/** Endpoints used in the last `days` of already-published puzzles, so names don't repeat too often. */
function recentEndpoints(category: CategoryId, beforeDate: string, days: number): Set<string> {
  const set = new Set<string>()
  const from = addDays(beforeDate, -days)
  for (const date of existingPuzzleDates(category)) {
    if (date < from || date >= beforeDate) continue
    const p = readPuzzle(category, date)
    if (p) set.add(p.start).add(p.end)
  }
  return set
}

function usedPairs(category: CategoryId): Set<string> {
  const set = new Set<string>()
  for (const date of existingPuzzleDates(category)) {
    const p = readPuzzle(category, date)
    if (p) set.add(pairKey(p.start, p.end))
  }
  return set
}

export function generateSeries(opts: {
  category: CategoryId
  contextFor: (date: string) => GraphContext
  maxNodes: number
  minPar?: number
  maxPar?: number
}): void {
  const { count, startDate } = parseArgs()
  const first = startDate ?? nextStartDate(opts.category)
  const excludePairs = usedPairs(opts.category)
  const recent = recentEndpoints(opts.category, first, 30)

  for (let i = 0; i < count; i++) {
    const date = addDays(first, i)
    const ctx = opts.contextFor(date)
    const pair = pickPuzzlePair(ctx.nodes, ctx.edges, {
      minPar: opts.minPar ?? 4,
      maxPar: opts.maxPar ?? 8,
      isEndpoint: ctx.isEndpoint,
      excludePairs,
      excludeEndpoints: recent,
    })
    if (!pair) {
      console.warn(`  ${date}: no valid pair found — skipping`)
      continue
    }
    excludePairs.add(pairKey(pair.start, pair.end))
    recent.add(pair.start).add(pair.end)

    const sub = buildPuzzleGraph(ctx.nodes, ctx.edges, pair.path, { maxNodes: opts.maxNodes, extraNames: ctx.extraNames })
    writePuzzle({
      date,
      category: opts.category,
      start: pair.start,
      end: pair.end,
      nodes: sub.nodes,
      edges: sub.edges,
      parMoves: pair.path.length - 1,
      tag: ctx.tag,
      extras: sub.extras,
    })
  }
}

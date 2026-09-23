import type { CategoryId, PuzzleEdge } from '../../../src/engine/types'
import { bfsDistances, pairKey, pickPuzzlePair, type RawNode } from './graph'
import { writeGraph } from './graphFile'
import { addDays, existingPuzzleDates, nextStartDate, readPuzzle, removePuzzle, todayUtc, writePuzzle } from './writePuzzle'

export interface GraphContext {
  /** Graph file name, e.g. "actors-movies" or "athletes-nfl". */
  name: string
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

function chainLength(ctx: GraphContext, start: string, end: string): number | undefined {
  if (ctx.nodes[start]?.type !== 'person' || ctx.nodes[end]?.type !== 'person') return undefined
  return bfsDistances(ctx.edges, start).get(end)
}

/**
 * Writes the category's graph file(s), converts/repairs every existing puzzle
 * against them, then extends the calendar by `--count` days. Existing puzzles
 * keep their start/end whenever still valid, so a rebuilt graph never changes
 * a puzzle someone may already be playing.
 */
export function generateSeries(opts: {
  category: CategoryId
  contexts: GraphContext[]
  contextFor: (date: string) => GraphContext
  minPar?: number
  maxPar?: number
}): void {
  const minPar = opts.minPar ?? 4
  const maxPar = opts.maxPar ?? 8
  const graphPath = new Map(opts.contexts.map((ctx) => [ctx.name, writeGraph(ctx.name, ctx.nodes, ctx.edges, ctx.extraNames)]))
  const today = todayUtc()

  const toGenerate: string[] = []
  let kept = 0
  for (const date of existingPuzzleDates(opts.category)) {
    const existing = readPuzzle(opts.category, date)
    const ctx = opts.contextFor(date)
    const length = existing ? chainLength(ctx, existing.start, existing.end) : undefined
    if (existing && length !== undefined && length >= minPar) {
      writePuzzle({ date, category: opts.category, start: existing.start, end: existing.end, tag: ctx.tag, graph: graphPath.get(ctx.name)! })
      kept++
    } else if (date >= today) {
      console.warn(`  ${date}: no longer valid against the rebuilt graph — regenerating`)
      toGenerate.push(date)
    } else {
      console.warn(`  ${date}: past puzzle no longer valid — removing`)
      removePuzzle(opts.category, date)
    }
  }
  console.log(`  ${kept} existing puzzles kept`)

  const { count, startDate } = parseArgs()
  const first = startDate ?? nextStartDate(opts.category)
  for (let i = 0; i < count; i++) toGenerate.push(addDays(first, i))

  const excludePairs = new Set<string>()
  const recent = new Set<string>()
  for (const date of existingPuzzleDates(opts.category)) {
    const p = readPuzzle(opts.category, date)
    if (!p) continue
    excludePairs.add(pairKey(p.start, p.end))
    if (date >= addDays(first, -30)) recent.add(p.start).add(p.end)
  }

  for (const date of toGenerate) {
    const ctx = opts.contextFor(date)
    const pair = pickPuzzlePair(ctx.nodes, ctx.edges, { minPar, maxPar, isEndpoint: ctx.isEndpoint, excludePairs, excludeEndpoints: recent })
    if (!pair) {
      console.warn(`  ${date}: no valid pair found — skipping`)
      continue
    }
    excludePairs.add(pairKey(pair.start, pair.end))
    recent.add(pair.start).add(pair.end)
    writePuzzle(
      { date, category: opts.category, start: pair.start, end: pair.end, tag: ctx.tag, graph: graphPath.get(ctx.name)! },
      `${ctx.nodes[pair.start].name} → ${ctx.nodes[pair.end].name}, ${(pair.path.length - 1) / 2} links`,
    )
  }
}

import type { PuzzleEdge, PuzzleNode } from '../../../src/engine/types'

export type RawNode = PuzzleNode

const adjacencyCache = new WeakMap<PuzzleEdge[], Map<string, string[]>>()

export function buildAdjacency(edges: PuzzleEdge[]): Map<string, string[]> {
  let adj = adjacencyCache.get(edges)
  if (adj) return adj
  adj = new Map()
  for (const e of edges) {
    if (!adj.has(e.a)) adj.set(e.a, [])
    if (!adj.has(e.b)) adj.set(e.b, [])
    adj.get(e.a)!.push(e.b)
    adj.get(e.b)!.push(e.a)
  }
  adjacencyCache.set(edges, adj)
  return adj
}

/** Collects person<->work edges without duplicates. */
export class GraphBuilder {
  nodes: Record<string, RawNode> = {}
  edges: PuzzleEdge[] = []
  private seen = new Set<string>()

  addNode(node: RawNode) {
    if (!this.nodes[node.id]) this.nodes[node.id] = node
  }

  link(personId: string, workId: string) {
    const key = `${personId}|${workId}`
    if (this.seen.has(key)) return
    this.seen.add(key)
    this.edges.push({ a: personId, b: workId })
  }
}

/** BFS distance (in edges) from startId to every reachable node. */
export function bfsDistances(edges: PuzzleEdge[], startId: string): Map<string, number> {
  const adj = buildAdjacency(edges)
  const dist = new Map<string, number>([[startId, 0]])
  const queue = [startId]
  for (let head = 0; head < queue.length; head++) {
    const cur = queue[head]
    const d = dist.get(cur)!
    for (const next of adj.get(cur) ?? []) {
      if (!dist.has(next)) {
        dist.set(next, d + 1)
        queue.push(next)
      }
    }
  }
  return dist
}

export function shortestPath(edges: PuzzleEdge[], startId: string, endId: string): string[] | null {
  const adj = buildAdjacency(edges)
  const prev = new Map<string, string | null>([[startId, null]])
  const queue = [startId]
  for (let head = 0; head < queue.length; head++) {
    const cur = queue[head]
    if (cur === endId) break
    for (const next of adj.get(cur) ?? []) {
      if (!prev.has(next)) {
        prev.set(next, cur)
        queue.push(next)
      }
    }
  }
  if (!prev.has(endId)) return null
  const path = [endId]
  for (let p = prev.get(endId); p; p = prev.get(p)) path.push(p)
  return path.reverse()
}

export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

/**
 * Picks a (start, end) pair among allowed endpoints whose shortest path is in
 * [minPar, maxPar] edges, aiming for a random target length so difficulty
 * varies from day to day.
 */
export function pickPuzzlePair(
  nodes: Record<string, RawNode>,
  edges: PuzzleEdge[],
  opts: {
    minPar: number
    maxPar: number
    isEndpoint: (id: string) => boolean
    excludePairs: Set<string>
    excludeEndpoints: Set<string>
  },
): { start: string; end: string; path: string[] } | null {
  const allowed = (id: string) =>
    nodes[id]?.type === 'person' && opts.isEndpoint(id) && !opts.excludeEndpoints.has(id)
  const pool = Object.keys(nodes).filter(allowed)
  // Even edge counts only: person -> work -> person ...
  const targets: number[] = []
  for (let p = opts.minPar; p <= opts.maxPar; p += 2) targets.push(p)
  const target = targets[Math.floor(Math.random() * targets.length)]
  const shuffled = pool.sort(() => Math.random() - 0.5)

  let best: { start: string; end: string; score: number } | null = null
  for (const start of shuffled.slice(0, 60)) {
    for (const [end, d] of bfsDistances(edges, start)) {
      if (end === start || d < opts.minPar || d > opts.maxPar || !allowed(end)) continue
      if (opts.excludePairs.has(pairKey(start, end))) continue
      const score = Math.abs(d - target) + Math.random() * 0.5
      if (!best || score < best.score) best = { start, end, score }
    }
    if (best && best.score < 0.5) break
  }
  if (!best) return null
  const path = shortestPath(edges, best.start, best.end)
  return path ? { start: best.start, end: best.end, path } : null
}

/** Extra names a title can be guessed by: "Star Wars: A New Hope" -> ["A New Hope", "Star Wars"]. */
export function titleAliases(title: string): string[] | undefined {
  const parts = title
    .split(/:\s+|\s+-\s+|\s+–\s+/)
    .map((p) => p.trim())
    .filter((p) => p.length >= 3 && p !== title)
  return parts.length > 1 ? parts : undefined
}

import type { PuzzleEdge, PuzzleNode } from '../../../src/engine/types'

export type RawNode = PuzzleNode

interface BuildGraphOptions {
  seeds: RawNode[]
  maxNodes: number
  worksOfPerson: (personId: string) => Promise<RawNode[]>
  peopleOfWork: (workId: string) => Promise<RawNode[]>
  /** Called after each fetch so callers can log crawl progress. */
  onProgress?: (info: { visited: number; queued: number; nodes: number }) => void
}

/**
 * Breadth-first crawl of a bipartite person<->work graph. Alternates
 * fetching a person's works and a work's people, capped at maxNodes so the
 * crawl (and the free-API request budget) stays bounded.
 */
export async function buildBipartiteGraph(
  opts: BuildGraphOptions,
): Promise<{ nodes: Record<string, RawNode>; edges: PuzzleEdge[] }> {
  const nodes: Record<string, RawNode> = {}
  const edges: PuzzleEdge[] = []
  const edgeSet = new Set<string>()
  const visitedPerson = new Set<string>()
  const visitedWork = new Set<string>()
  const queue: { id: string; kind: 'person' | 'work' }[] = []

  for (const seed of opts.seeds) {
    nodes[seed.id] = seed
    queue.push({ id: seed.id, kind: 'person' })
  }

  function addEdge(a: string, b: string) {
    const key = a < b ? `${a}|${b}` : `${b}|${a}`
    if (edgeSet.has(key)) return
    edgeSet.add(key)
    edges.push({ a, b })
  }

  let visitedCount = 0
  while (queue.length > 0 && Object.keys(nodes).length < opts.maxNodes) {
    const item = queue.shift()!
    if (item.kind === 'person') {
      if (visitedPerson.has(item.id)) continue
      visitedPerson.add(item.id)
      let works: RawNode[]
      try {
        works = await opts.worksOfPerson(item.id)
      } catch (e) {
        console.warn(`worksOfPerson(${item.id}) failed: ${(e as Error).message}`)
        continue
      }
      for (const w of works) {
        nodes[w.id] = w
        addEdge(item.id, w.id)
        if (!visitedWork.has(w.id)) queue.push({ id: w.id, kind: 'work' })
      }
    } else {
      if (visitedWork.has(item.id)) continue
      visitedWork.add(item.id)
      let people: RawNode[]
      try {
        people = await opts.peopleOfWork(item.id)
      } catch (e) {
        console.warn(`peopleOfWork(${item.id}) failed: ${(e as Error).message}`)
        continue
      }
      for (const p of people) {
        nodes[p.id] = p
        addEdge(item.id, p.id)
        if (!visitedPerson.has(p.id)) queue.push({ id: p.id, kind: 'person' })
      }
    }
    visitedCount++
    opts.onProgress?.({ visited: visitedCount, queued: queue.length, nodes: Object.keys(nodes).length })
  }

  return { nodes, edges }
}

export function buildAdjacency(edges: PuzzleEdge[]): Map<string, string[]> {
  const adj = new Map<string, string[]>()
  for (const e of edges) {
    if (!adj.has(e.a)) adj.set(e.a, [])
    if (!adj.has(e.b)) adj.set(e.b, [])
    adj.get(e.a)!.push(e.b)
    adj.get(e.b)!.push(e.a)
  }
  return adj
}

/** BFS distance (in edges) from startId to every reachable node. */
export function bfsDistances(edges: PuzzleEdge[], startId: string): Map<string, number> {
  const adj = buildAdjacency(edges)
  const dist = new Map<string, number>([[startId, 0]])
  const queue = [startId]
  while (queue.length) {
    const cur = queue.shift()!
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
  const prev = new Map<string, string>()
  const visited = new Set([startId])
  const queue = [startId]
  while (queue.length) {
    const cur = queue.shift()!
    if (cur === endId) break
    for (const next of adj.get(cur) ?? []) {
      if (!visited.has(next)) {
        visited.add(next)
        prev.set(next, cur)
        queue.push(next)
      }
    }
  }
  if (!visited.has(endId)) return null
  const path = [endId]
  while (path[path.length - 1] !== startId) {
    const p = prev.get(path[path.length - 1])
    if (!p) return null
    path.push(p)
  }
  return path.reverse()
}

/**
 * Picks a (start, end) person pair whose shortest path falls in
 * [minPar, maxPar] hops, preferring pairs close to the middle of that
 * range. Returns null if no such pair exists in the crawled graph.
 */
export function pickPuzzlePair(
  nodes: Record<string, RawNode>,
  edges: PuzzleEdge[],
  opts: {
    minPar: number
    maxPar: number
    excludePairs?: Set<string>
    /** Restricts which persons may be chosen as start/end (not intermediate path nodes) — e.g. a notability floor so puzzles don't hinge on an obscure name. */
    endpointFilter?: (id: string) => boolean
  },
): { start: string; end: string; path: string[] } | null {
  const endpointFilter = opts.endpointFilter ?? (() => true)
  const personIds = Object.values(nodes)
    .filter((n) => n.type === 'person' && endpointFilter(n.id))
    .map((n) => n.id)
  const target = opts.minPar + Math.random() * (opts.maxPar - opts.minPar)
  const shuffled = [...personIds].sort(() => Math.random() - 0.5)

  let best: { start: string; end: string; path: string[]; score: number } | null = null

  for (const start of shuffled.slice(0, Math.min(40, shuffled.length))) {
    const dist = bfsDistances(edges, start)
    for (const [end, d] of dist) {
      if (end === start || d < opts.minPar || d > opts.maxPar) continue
      if (nodes[end]?.type !== 'person' || !endpointFilter(end)) continue
      const pairKey = start < end ? `${start}|${end}` : `${end}|${start}`
      if (opts.excludePairs?.has(pairKey)) continue
      const score = Math.abs(d - target)
      if (!best || score < best.score) {
        const path = shortestPath(edges, start, end)
        if (path) best = { start, end, path, score }
      }
    }
    if (best && best.score === 0) break
  }

  return best
}

export function subgraphAroundPath(
  nodes: Record<string, RawNode>,
  edges: PuzzleEdge[],
  path: string[],
  radius: number,
  maxNodes: number,
): { nodes: Record<string, RawNode>; edges: PuzzleEdge[] } {
  const adj = buildAdjacency(edges)
  const included = new Set<string>(path)
  let frontier = new Set<string>(path)

  for (let hop = 0; hop < radius && included.size < maxNodes; hop++) {
    const nextFrontier = new Set<string>()
    for (const id of frontier) {
      for (const n of adj.get(id) ?? []) {
        if (included.has(n)) continue
        included.add(n)
        nextFrontier.add(n)
        if (included.size >= maxNodes) break
      }
      if (included.size >= maxNodes) break
    }
    frontier = nextFrontier
  }

  const outNodes: Record<string, RawNode> = {}
  for (const id of included) if (nodes[id]) outNodes[id] = nodes[id]
  const outEdges = edges.filter((e) => included.has(e.a) && included.has(e.b))
  return { nodes: outNodes, edges: outEdges }
}

import type { CategoryId, PuzzleEdge, PuzzleNode } from './types'

/**
 * A whole category's (or league's) graph in one compact file, shared by every
 * puzzle that uses it, so any real route through the data is playable — not
 * just ones near the intended solution.
 */
export interface GraphFile {
  version: 1
  /** [id, name, 'p'|'w', subtitle, year, aliases] — empty trailing fields are omitted. */
  nodes: [string, string, 'p' | 'w', string?, number?, string[]?][]
  /** [workIndex, ...personIndices]: everyone linked to each work. */
  links: number[][]
  /** Node index -> real-world neighbor names that aren't in the graph. */
  extras?: Record<string, string[]>
}

/** What's stored per day: just the two endpoints and which graph they live in. */
export interface PuzzleFile {
  date: string
  category: CategoryId
  number: number
  start: string
  end: string
  tag?: string
  /** Path of the GraphFile, relative to the site root (e.g. "graphs/actors-movies.json"). */
  graph: string
}

export interface ExpandedGraph {
  nodes: Record<string, PuzzleNode>
  edges: PuzzleEdge[]
  extras: Record<string, string[]>
}

export function expandGraph(file: GraphFile): ExpandedGraph {
  const nodes: Record<string, PuzzleNode> = {}
  const ids = file.nodes.map(([id, name, type, subtitle, year, aliases]) => {
    const node: PuzzleNode = { id, name, type: type === 'p' ? 'person' : 'work' }
    if (subtitle) node.subtitle = subtitle
    if (year) node.year = year
    if (aliases?.length) node.aliases = aliases
    nodes[id] = node
    return id
  })
  const edges: PuzzleEdge[] = []
  for (const [work, ...people] of file.links) for (const p of people) edges.push({ a: ids[p], b: ids[work] })
  const extras: Record<string, string[]> = {}
  for (const [index, names] of Object.entries(file.extras ?? {})) extras[ids[Number(index)]] = names
  return { nodes, edges, extras }
}

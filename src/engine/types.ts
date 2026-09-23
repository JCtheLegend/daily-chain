export type CategoryId = 'actors-movies' | 'artists-songs' | 'athletes-teams'

export type NodeType = 'person' | 'work'

export interface PuzzleNode {
  id: string
  name: string
  /** Alternate spellings/short forms accepted as a correct guess for this node. */
  aliases?: string[]
  type: NodeType
  /** Small bit of display context, e.g. a year or season. */
  subtitle?: string
  /** Sort key for ordering same-name nodes (e.g. the seasons of one team). */
  year?: number
}

export interface PuzzleEdge {
  a: string
  b: string
}

export interface Puzzle {
  date: string
  category: CategoryId
  /** Sequential puzzle number since the game's epoch date, shown to players. */
  number: number
  start: string
  end: string
  nodes: Record<string, PuzzleNode>
  edges: PuzzleEdge[]
  /** Hop count (edges) of a shortest start->end path, computed when loaded. Links = parMoves / 2. */
  parMoves: number
  /** Graph file the nodes/edges came from. */
  graph?: string
  /** Extra label for the puzzle, e.g. the league for sports puzzles. */
  tag?: string
  /**
   * Real-world neighbors of a node that aren't part of today's graph (e.g. an
   * actor's other movies). Lets a true-but-unhelpful guess be told apart from
   * a wrong one.
   */
  extras?: Record<string, string[]>
}

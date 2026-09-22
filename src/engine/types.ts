export type CategoryId = 'actors-movies' | 'artists-songs' | 'athletes-teams'

export type NodeType = 'person' | 'work'

export interface PuzzleNode {
  id: string
  name: string
  /** Alternate spellings/short forms accepted as a correct guess for this node. */
  aliases?: string[]
  type: NodeType
  /** Small bit of display context, e.g. a year or team-season. */
  subtitle?: string
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
  /** Hop count (edges) of a shortest start->end path. Used as "par". */
  parMoves: number
}

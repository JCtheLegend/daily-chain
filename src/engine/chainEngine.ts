import Fuse from 'fuse.js'
import type { Puzzle, PuzzleNode } from './types'

export interface GuessRecord {
  text: string
  matchedNodeId: string | null
  correct: boolean
}

export interface ChainState {
  path: string[]
  guesses: GuessRecord[]
  won: boolean
}

export function initialChainState(puzzle: Puzzle): ChainState {
  return { path: [puzzle.start], guesses: [], won: puzzle.start === puzzle.end }
}

export function neighborsOf(puzzle: Puzzle, nodeId: string): string[] {
  const out: string[] = []
  for (const e of puzzle.edges) {
    if (e.a === nodeId) out.push(e.b)
    else if (e.b === nodeId) out.push(e.a)
  }
  return out
}

export function normalize(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
}

/**
 * Matches free-text input against the neighbors of the current chain node
 * only — a correct entity name that isn't actually reachable from here is
 * still a wrong guess, same as Bacon-number games. Tries exact/alias match
 * before falling back to fuzzy matching for typos/spelling variants.
 */
export function findNeighborMatch(puzzle: Puzzle, currentNodeId: string, guessText: string): PuzzleNode | null {
  const neighborIds = neighborsOf(puzzle, currentNodeId)
  const normalizedGuess = normalize(guessText)
  if (neighborIds.length === 0 || !normalizedGuess) return null

  for (const id of neighborIds) {
    const node = puzzle.nodes[id]
    const candidates = [node.name, ...(node.aliases ?? [])]
    if (candidates.some((c) => normalize(c) === normalizedGuess)) return node
  }

  const items = neighborIds.flatMap((id) => {
    const node = puzzle.nodes[id]
    return [node.name, ...(node.aliases ?? [])].map((name) => ({ id, normalized: normalize(name) }))
  })
  const fuse = new Fuse(items, { keys: ['normalized'], threshold: 0.25, ignoreLocation: true })
  const hit = fuse.search(normalizedGuess)[0]
  return hit ? puzzle.nodes[hit.item.id] : null
}

export function submitGuess(puzzle: Puzzle, state: ChainState, guessText: string): ChainState {
  if (state.won) return state
  const current = state.path[state.path.length - 1]
  const match = findNeighborMatch(puzzle, current, guessText)
  const alreadyInPath = match ? state.path.includes(match.id) : false
  const isValid = !!match && !alreadyInPath

  const record: GuessRecord = { text: guessText, matchedNodeId: isValid ? match!.id : null, correct: isValid }
  const nextPath = isValid ? [...state.path, match!.id] : state.path
  const won = isValid && match!.id === puzzle.end

  return { path: nextPath, guesses: [...state.guesses, record], won }
}

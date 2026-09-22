import Fuse from 'fuse.js'
import type { Puzzle, PuzzleNode } from './types'

/**
 * - correct: a real link that still has a route to the target
 * - dead-end: a real link in today's graph, but no route to the target from it
 * - off-graph: a real-world link that isn't part of today's puzzle
 * - wrong: not a link we know of
 */
export type Outcome = 'correct' | 'dead-end' | 'off-graph' | 'wrong'

export interface GuessRecord {
  text: string
  outcome: Outcome
  /** Canonical name of what the guess matched, when it matched something. */
  matchedName?: string
  /** Name of the chain node the guess was made from. */
  fromName: string
}

/**
 * One position in the chain. Several ids share a name when, e.g., a player
 * spent multiple seasons on one team: "Lakers" stands for all of them until the
 * next guess narrows it to the seasons that player shares with the next one.
 */
export interface ChainStep {
  ids: string[]
  /** ids before any narrowing, restored when a later step is undone. */
  all: string[]
}

export interface ChainState {
  steps: ChainStep[]
  guesses: GuessRecord[]
  won: boolean
  revealed: boolean
  hintsUsed: number
  /** How far the hint for the current position has been revealed (0-2). */
  hintLevel: number
}

export type Feedback =
  | { kind: 'recorded'; record: GuessRecord }
  | { kind: 'repeat'; name: string }
  | { kind: 'ignored' }

export function initialChainState(puzzle: Puzzle): ChainState {
  return {
    steps: [{ ids: [puzzle.start], all: [puzzle.start] }],
    guesses: [],
    won: false,
    revealed: false,
    hintsUsed: 0,
    hintLevel: 0,
  }
}

const adjacencyCache = new WeakMap<Puzzle, Map<string, string[]>>()

function adjacency(puzzle: Puzzle): Map<string, string[]> {
  let adj = adjacencyCache.get(puzzle)
  if (!adj) {
    adj = new Map()
    for (const e of puzzle.edges) {
      if (!adj.has(e.a)) adj.set(e.a, [])
      if (!adj.has(e.b)) adj.set(e.b, [])
      adj.get(e.a)!.push(e.b)
      adj.get(e.b)!.push(e.a)
    }
    adjacencyCache.set(puzzle, adj)
  }
  return adj
}

export function normalize(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^the /, '')
}

function namesOf(node: PuzzleNode): string[] {
  return [node.name, ...(node.aliases ?? [])]
}

/**
 * Best match of `guess` among candidate groups: exact name/alias first, then a
 * whole-word prefix/containment match, then fuzzy matching for typos.
 */
function bestMatch<T>(candidates: { value: T; names: string[] }[], guess: string): T | null {
  const g = normalize(guess)
  if (!g || candidates.length === 0) return null

  for (const c of candidates) if (c.names.some((n) => normalize(n) === g)) return c.value

  if (g.length >= 3) {
    const wordHit = candidates.filter((c) =>
      c.names.some((n) => {
        const nn = normalize(n)
        return nn.startsWith(g + ' ') || nn.endsWith(' ' + g) || nn.includes(' ' + g + ' ')
      }),
    )
    if (wordHit.length === 1) return wordHit[0].value
  }

  const items = candidates.flatMap((c, i) => c.names.map((n) => ({ i, n: normalize(n) })))
  const fuse = new Fuse(items, { keys: ['n'], threshold: 0.3, ignoreLocation: true, includeScore: true })
  const hit = fuse.search(g)[0]
  // Short guesses fuzzy-match too much; require a close score for them.
  if (!hit || (g.length < 4 && (hit.score ?? 1) > 0.1)) return null
  return candidates[hit.item.i].value
}

function groupByName(puzzle: Puzzle, ids: string[]): { value: string[]; names: string[] }[] {
  const groups = new Map<string, string[]>()
  for (const id of ids) {
    const key = normalize(puzzle.nodes[id].name)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(id)
  }
  return [...groups.values()].map((groupIds) => ({
    value: groupIds,
    names: [...new Set(groupIds.flatMap((id) => namesOf(puzzle.nodes[id])))],
  }))
}

export function usedIds(state: ChainState): Set<string> {
  return new Set(state.steps.flatMap((s) => s.ids))
}

function neighborsOfStep(puzzle: Puzzle, ids: string[], exclude: Set<string>): string[] {
  const adj = adjacency(puzzle)
  const out = new Set<string>()
  for (const id of ids) for (const n of adj.get(id) ?? []) if (!exclude.has(n)) out.add(n)
  return [...out]
}

/** Shortest route (node ids, starting with one of `from`) to the target, avoiding `blocked`. */
export function routeToEnd(puzzle: Puzzle, from: string[], blocked: Set<string>): string[] | null {
  const adj = adjacency(puzzle)
  const prev = new Map<string, string | null>()
  const queue: string[] = []
  for (const id of from) {
    prev.set(id, null)
    queue.push(id)
  }
  while (queue.length) {
    const cur = queue.shift()!
    if (cur === puzzle.end) {
      const route = [cur]
      let p = prev.get(cur)
      while (p) {
        route.push(p)
        p = prev.get(p)
      }
      return route.reverse()
    }
    for (const n of adj.get(cur) ?? []) {
      if (prev.has(n) || blocked.has(n)) continue
      prev.set(n, cur)
      queue.push(n)
    }
  }
  return null
}

export function solutionPath(puzzle: Puzzle): string[] {
  return routeToEnd(puzzle, [puzzle.start], new Set()) ?? [puzzle.start]
}

export function stepName(puzzle: Puzzle, step: ChainStep): string {
  return puzzle.nodes[step.ids[0]].name
}

export function submitGuess(puzzle: Puzzle, state: ChainState, text: string): { state: ChainState; feedback: Feedback } {
  if (state.won || state.revealed || !text.trim()) return { state, feedback: { kind: 'ignored' } }

  const adj = adjacency(puzzle)
  const used = usedIds(state)
  const current = state.steps[state.steps.length - 1]
  const fromName = stepName(puzzle, current)
  const record = (outcome: Outcome, matchedName?: string): { state: ChainState; feedback: Feedback } => {
    const rec: GuessRecord = { text, outcome, matchedName, fromName }
    return { state: { ...state, guesses: [...state.guesses, rec] }, feedback: { kind: 'recorded', record: rec } }
  }

  const neighbors = neighborsOfStep(puzzle, current.ids, used)
  const matched = bestMatch(groupByName(puzzle, neighbors), text)

  if (matched) {
    const matchedName = puzzle.nodes[matched[0]].name
    // Narrow the current step to only the nodes linked to what was just named
    // (e.g. only the seasons two players actually shared).
    const narrowedCurrent = current.ids.filter((c) => matched.some((m) => adj.get(c)?.includes(m)))
    const newIds = matched.filter((m) => narrowedCurrent.some((c) => adj.get(c)?.includes(m)))
    const newStep: ChainStep = { ids: newIds, all: newIds }
    const steps = [...state.steps.slice(0, -1), { ...current, ids: narrowedCurrent }, newStep]

    if (newIds.includes(puzzle.end)) {
      const endStep = { ids: [puzzle.end], all: [puzzle.end] }
      const rec: GuessRecord = { text, outcome: 'correct', matchedName, fromName }
      return {
        state: { ...state, steps: [...steps.slice(0, -1), endStep], guesses: [...state.guesses, rec], won: true, hintLevel: 0 },
        feedback: { kind: 'recorded', record: rec },
      }
    }

    if (!routeToEnd(puzzle, newIds, used)) return record('dead-end', matchedName)

    const rec: GuessRecord = { text, outcome: 'correct', matchedName, fromName }
    return {
      state: { ...state, steps, guesses: [...state.guesses, rec], hintLevel: 0 },
      feedback: { kind: 'recorded', record: rec },
    }
  }

  const usedNeighbors = neighborsOfStep(puzzle, current.ids, new Set()).filter((id) => used.has(id))
  const repeat = bestMatch(groupByName(puzzle, usedNeighbors), text)
  if (repeat) return { state, feedback: { kind: 'repeat', name: puzzle.nodes[repeat[0]].name } }

  const extras = [...new Set(current.ids.flatMap((id) => puzzle.extras?.[id] ?? []))]
  const extraHit = bestMatch(extras.map((n) => ({ value: n, names: [n] })), text)
  if (extraHit) return record('off-graph', extraHit)

  return record('wrong')
}

export function undo(state: ChainState): ChainState {
  if (state.won || state.revealed || state.steps.length <= 1) return state
  const steps = state.steps.slice(0, -1)
  const last = steps[steps.length - 1]
  steps[steps.length - 1] = { ...last, ids: last.all }
  return { ...state, steps, hintLevel: 0 }
}

export function eraseChain(state: ChainState): ChainState {
  if (state.won || state.revealed) return state
  const first = state.steps[0]
  return { ...state, steps: [{ ...first, ids: first.all }], hintLevel: 0 }
}

/** The next node on a shortest route from the player's current position, if any. */
export function nextHintNode(puzzle: Puzzle, state: ChainState): PuzzleNode | null {
  const current = state.steps[state.steps.length - 1]
  const blocked = usedIds(state)
  for (const id of current.ids) blocked.delete(id)
  const route = routeToEnd(puzzle, current.ids, blocked)
  return route && route.length > 1 ? puzzle.nodes[route[1]] : null
}

export function takeHint(state: ChainState): ChainState {
  if (state.won || state.revealed || state.hintLevel >= 2) return state
  return { ...state, hintLevel: state.hintLevel + 1, hintsUsed: state.hintsUsed + 1 }
}

export function revealSolution(state: ChainState): ChainState {
  if (state.won) return state
  return { ...state, revealed: true }
}

/** "Tom Hanks" -> "T__ H____" */
export function maskName(name: string): string {
  return name
    .split(' ')
    .map((word) => word.slice(0, 1) + word.slice(1).replace(/[\p{L}\p{N}]/gu, '_'))
    .join(' ')
}

/** Number of links (movies/songs/teams) in a chain of `nodeCount` nodes. */
export function linkCount(nodeCount: number): number {
  return Math.floor(nodeCount / 2)
}

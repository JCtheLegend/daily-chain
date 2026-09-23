import Fuse from 'fuse.js'
import type { Puzzle, PuzzleNode } from './types'

/**
 * - correct: a real link that still has a route to the target
 * - dead-end: a real link in today's graph, but no route to the target from it
 * - loop: a real link whose only way on is straight back to the link just named,
 *   when someone else on that link would get there sooner
 * - off-graph: a real-world link that isn't part of today's puzzle
 * - wrong: not a link we know of
 */
export type Outcome = 'correct' | 'dead-end' | 'loop' | 'off-graph' | 'wrong'

export interface GuessRecord {
  text: string
  outcome: Outcome
  /** Canonical name of what the guess matched, when it matched something. */
  matchedName?: string
  /** Name of the chain node the guess was made from. */
  fromName: string
  /** A person this guess made unnecessary and removed from the chain. */
  dropped?: string
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
  /** Named the link the chain just came from: stepped back to it. */
  | { kind: 'reopened'; work: string; person: string }
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
    .replace(/\b(dr|mr|mrs|st|mt|jr|sr)\b/g, (abbr) => ABBREVIATIONS[abbr])
}

/** Applied to both guesses and names, so "Dr Strange" matches "Doctor Strange". */
const ABBREVIATIONS: Record<string, string> = {
  dr: 'doctor', mr: 'mister', mrs: 'missus', st: 'saint', mt: 'mount', jr: 'junior', sr: 'senior',
}

/** False if a saved game refers to nodes that are no longer in the puzzle's graph. */
export function isStateCompatible(puzzle: Puzzle, state: ChainState): boolean {
  return state.steps.length > 0 && state.steps[0].ids[0] === puzzle.start && state.steps.every((s) => s.all.every((id) => puzzle.nodes[id]))
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

/**
 * When the chain goes work -> person -> same-named work (Packers -> A.J. Hawk ->
 * Packers again), that middle person is a "bridge" the chain may not need: if
 * the next person named also shared the first link with the person before
 * the bridge, the bridge is dropped.
 */
function bridgeAt(puzzle: Puzzle, steps: ChainStep[]) {
  const n = steps.length - 1
  if (n < 3 || puzzle.nodes[steps[n].ids[0]].type !== 'work') return null
  if (normalize(stepName(puzzle, steps[n])) !== normalize(stepName(puzzle, steps[n - 2]))) return null
  return { firstWork: steps[n - 2], bridgePerson: steps[n - 1], personBefore: steps[n - 3] }
}

/** Who the next person has to share the current link with: "A.J. Hawk or Jeff Saturday". */
export function linkedPeople(puzzle: Puzzle, state: ChainState): string[] {
  const n = state.steps.length - 1
  if (n < 1) return []
  const bridge = bridgeAt(puzzle, state.steps)
  const previous = stepName(puzzle, state.steps[n - 1])
  return bridge ? [previous, stepName(puzzle, bridge.personBefore)] : [previous]
}

export function submitGuess(puzzle: Puzzle, state: ChainState, text: string): { state: ChainState; feedback: Feedback } {
  if (state.won || state.revealed || !text.trim()) return { state, feedback: { kind: 'ignored' } }

  const adj = adjacency(puzzle)
  const linked = (a: string, b: string) => adj.get(a)?.includes(b) ?? false
  const used = usedIds(state)
  const n = state.steps.length - 1
  const current = state.steps[n]
  const fromName = stepName(puzzle, current)
  const record = (outcome: Outcome, matchedName?: string): { state: ChainState; feedback: Feedback } => {
    const rec: GuessRecord = { text, outcome, matchedName, fromName }
    return { state: { ...state, guesses: [...state.guesses, rec] }, feedback: { kind: 'recorded', record: rec } }
  }

  /**
   * A person named from a work (A.J. Hawk from the 2012 Packers) is a loop when
   * every way on goes straight back to that same team, and another player
   * from the link would reach the target in strictly fewer steps. Without the
   * second condition, a genuine bridge between seasons would be rejected.
   */
  function isLoop(personIds: string[], onward: string[]): boolean {
    const sameTeam = normalize(fromName)
    const backToTeam = neighborsOfStep(puzzle, personIds, new Set()).filter((id) => normalize(puzzle.nodes[id].name) === sameTeam)
    const before = new Set(state.steps.slice(0, n).flatMap((s) => s.ids))
    if (routeToEnd(puzzle, personIds, new Set([...before, ...current.all, ...backToTeam]))) return false
    const withoutThem = routeToEnd(puzzle, current.all, new Set([...before, ...personIds]))
    return !!withoutThem && withoutThem.length - 1 < onward.length
  }

  const bridge = bridgeAt(puzzle, state.steps)
  const neighbors = new Set(neighborsOfStep(puzzle, current.ids, used))
  if (bridge) for (const id of neighborsOfStep(puzzle, bridge.firstWork.all, used)) neighbors.add(id)
  const matched = bestMatch(groupByName(puzzle, [...neighbors]), text)

  if (matched) {
    const matchedName = puzzle.nodes[matched[0]].name
    let steps: ChainStep[]
    let dropped: string | undefined
    const mergedWork = bridge ? bridge.firstWork.all.filter((w) => matched.some((m) => linked(w, m))) : []

    if (bridge && mergedWork.length) {
      // Also shared the first link with the person before the bridge: skip the bridge.
      const newIds = matched.filter((m) => mergedWork.some((w) => linked(w, m)))
      steps = [...state.steps.slice(0, n - 2), { ids: mergedWork, all: bridge.firstWork.all }, { ids: newIds, all: newIds }]
      dropped = stepName(puzzle, bridge.bridgePerson)
    } else {
      // Narrow the current step to only the nodes linked to what was just named
      // (e.g. only the seasons two players actually shared).
      const narrowedCurrent = current.ids.filter((c) => matched.some((m) => linked(c, m)))
      const newIds = matched.filter((m) => narrowedCurrent.some((c) => linked(c, m)))
      steps = [...state.steps.slice(0, -1), { ...current, ids: narrowedCurrent }, { ids: newIds, all: newIds }]
    }

    const newIds = steps[steps.length - 1].ids
    const rec: GuessRecord = { text, outcome: 'correct', matchedName, fromName, dropped }
    if (newIds.includes(puzzle.end)) {
      steps[steps.length - 1] = { ids: [puzzle.end], all: [puzzle.end] }
      return {
        state: { ...state, steps, guesses: [...state.guesses, rec], won: true, hintLevel: 0 },
        feedback: { kind: 'recorded', record: rec },
      }
    }

    const usedBefore = new Set(steps.slice(0, -1).flatMap((s) => s.ids))
    const onward = routeToEnd(puzzle, newIds, usedBefore)
    if (!onward) return record('dead-end', matchedName)
    if (!dropped && puzzle.nodes[current.ids[0]].type === 'work' && isLoop(newIds, onward)) return record('loop', matchedName)

    return {
      state: { ...state, steps, guesses: [...state.guesses, rec], hintLevel: 0 },
      feedback: { kind: 'recorded', record: rec },
    }
  }

  const usedNeighbors = neighborsOfStep(puzzle, current.ids, new Set()).filter((id) => used.has(id))
  const repeat = bestMatch(groupByName(puzzle, usedNeighbors), text)
  if (repeat) {
    // Naming the link just before this person again means "go back to it and pick someone else".
    const previous = n >= 2 ? state.steps[n - 1] : null
    if (previous && puzzle.nodes[current.ids[0]].type === 'person' && repeat.some((id) => previous.all.includes(id))) {
      const steps = [...state.steps.slice(0, n - 1), { ...previous, ids: previous.all }]
      return {
        state: { ...state, steps, hintLevel: 0 },
        feedback: { kind: 'reopened', work: stepName(puzzle, previous), person: stepName(puzzle, state.steps[n - 2]) },
      }
    }
    return { state, feedback: { kind: 'repeat', name: puzzle.nodes[repeat[0]].name } }
  }

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

export interface Hint {
  node: PuzzleNode
  /** Set when the best move is to go back: the chain index to rewind to before naming `node`. */
  rewindTo?: number
}

/**
 * The best next link. Usually that's the next step on a shortest route from
 * the player's position, but if going back and choosing differently gives a
 * strictly shorter chain — or the forward route would just circle back to
 * the link the player came from — the hint says to go back instead.
 */
export function nextHint(puzzle: Puzzle, state: ChainState): Hint | null {
  const n = state.steps.length - 1
  const idsBefore = (i: number) => new Set(state.steps.slice(0, i).flatMap((s) => s.ids))

  const forward = routeToEnd(puzzle, state.steps[n].ids, idsBefore(n))
  let best = forward && forward.length > 1 ? { index: n, total: n + forward.length - 1, next: forward[1] } : null
  const circlesBack =
    !!best && n >= 1 && normalize(puzzle.nodes[best.next].name) === normalize(stepName(puzzle, state.steps[n - 1]))

  for (let i = n - 1; i >= 0; i--) {
    const route = routeToEnd(puzzle, state.steps[i].all, idsBefore(i))
    if (!route || route.length < 2 || state.steps[i + 1].all.includes(route[1])) continue
    const total = i + route.length - 1
    if (!best || total < best.total || (circlesBack && best.index === n && total <= best.total)) {
      best = { index: i, total, next: route[1] }
    }
  }

  if (!best) return null
  return best.index === n ? { node: puzzle.nodes[best.next] } : { node: puzzle.nodes[best.next], rewindTo: best.index }
}

/** Cuts the chain back so `index` is the last link, restoring any narrowing on it. */
export function rewindTo(state: ChainState, index: number): ChainState {
  if (state.won || state.revealed || index >= state.steps.length - 1) return state
  const steps = state.steps.slice(0, index + 1)
  const last = steps[index]
  steps[index] = { ...last, ids: last.all }
  // The hint stays open: after rewinding, the hinted node is simply the next link.
  return { ...state, steps }
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

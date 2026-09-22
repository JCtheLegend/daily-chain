/**
 * Checks every published puzzle: well-formed graph, correct par, and — by
 * replaying the shortest solution through the real game engine, typing each
 * name exactly as a player would — that the chain is actually solvable.
 * Exits non-zero on any problem so CI never publishes a broken puzzle.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CATEGORY_ORDER } from '../src/categories/config'
import { initialChainState, solutionPath, submitGuess } from '../src/engine/chainEngine'
import { puzzleNumberForDate } from '../src/engine/dailyIndex'
import type { Puzzle } from '../src/engine/types'

const ROOT = join(import.meta.dirname, '..', 'public', 'puzzles')
let errors = 0
let checked = 0

function fail(where: string, message: string) {
  errors++
  console.error(`✗ ${where}: ${message}`)
}

function shortestLength(puzzle: Puzzle): number | null {
  const adj = new Map<string, string[]>()
  for (const e of puzzle.edges) {
    adj.set(e.a, [...(adj.get(e.a) ?? []), e.b])
    adj.set(e.b, [...(adj.get(e.b) ?? []), e.a])
  }
  const dist = new Map([[puzzle.start, 0]])
  const queue = [puzzle.start]
  for (let head = 0; head < queue.length; head++) {
    const cur = queue[head]
    if (cur === puzzle.end) return dist.get(cur)!
    for (const n of adj.get(cur) ?? []) {
      if (!dist.has(n)) {
        dist.set(n, dist.get(cur)! + 1)
        queue.push(n)
      }
    }
  }
  return null
}

function validatePuzzle(where: string, p: Puzzle, category: string, date: string) {
  if (p.date !== date) fail(where, `date field ${p.date} doesn't match file name`)
  if (p.category !== category) fail(where, `category field ${p.category} doesn't match folder`)
  if (p.number !== puzzleNumberForDate(date)) fail(where, `number ${p.number} should be ${puzzleNumberForDate(date)}`)

  for (const [id, node] of Object.entries(p.nodes)) {
    if (node.id !== id) fail(where, `node key ${id} has id ${node.id}`)
    if (!node.name?.trim()) fail(where, `node ${id} has no name`)
    if (node.type !== 'person' && node.type !== 'work') fail(where, `node ${id} has bad type ${node.type}`)
  }
  for (const id of [p.start, p.end]) {
    if (p.nodes[id]?.type !== 'person') fail(where, `endpoint ${id} missing or not a person`)
  }
  if (p.start === p.end) fail(where, 'start and end are the same')

  const seen = new Set<string>()
  for (const e of p.edges) {
    const a = p.nodes[e.a]
    const b = p.nodes[e.b]
    if (!a || !b) {
      fail(where, `edge ${e.a}-${e.b} references a missing node`)
      continue
    }
    if (a.type === b.type) fail(where, `edge ${e.a}-${e.b} links two ${a.type} nodes`)
    const key = [e.a, e.b].sort().join('|')
    if (seen.has(key)) fail(where, `duplicate edge ${key}`)
    seen.add(key)
  }
  for (const id of Object.keys(p.extras ?? {})) if (!p.nodes[id]) fail(where, `extras for missing node ${id}`)

  const len = shortestLength(p)
  if (len === null) return fail(where, 'no chain connects start to end')
  if (len !== p.parMoves) fail(where, `parMoves ${p.parMoves} but shortest chain is ${len}`)
  if (len < 4 || len % 2) fail(where, `shortest chain length ${len} should be even and at least 4`)
  if (category === 'athletes-teams' && !p.tag) fail(where, 'sports puzzle has no league tag')

  // Play the shortest solution by typing each name exactly.
  let state = initialChainState(p)
  const path = solutionPath(p)
  for (const id of path.slice(1)) {
    const result = submitGuess(p, state, p.nodes[id].name)
    if (result.feedback.kind !== 'recorded' || result.feedback.record.outcome !== 'correct') {
      const got = result.feedback.kind === 'recorded' ? result.feedback.record.outcome : result.feedback.kind
      return fail(where, `typing "${p.nodes[id].name}" along the solution gave "${got}"`)
    }
    state = result.state
  }
  if (!state.won) fail(where, 'replaying the solution did not win')
}

for (const category of CATEGORY_ORDER) {
  const indexPath = join(ROOT, category, 'index.json')
  if (!existsSync(indexPath)) {
    fail(category, 'index.json is missing')
    continue
  }
  const dates: string[] = JSON.parse(readFileSync(indexPath, 'utf-8'))
  if (dates.length === 0) fail(category, 'no puzzles listed')
  for (const date of dates) {
    const where = `${category}/${date}`
    const file = join(ROOT, category, `${date}.json`)
    if (!existsSync(file)) {
      fail(where, 'listed in index.json but the file is missing')
      continue
    }
    try {
      validatePuzzle(where, JSON.parse(readFileSync(file, 'utf-8')), category, date)
    } catch (e) {
      fail(where, `could not be read: ${(e as Error).message}`)
    }
    checked++
  }
}

console.log(`${checked} puzzles checked, ${errors} problem${errors === 1 ? '' : 's'}.`)
process.exit(errors ? 1 : 0)

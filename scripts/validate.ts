/**
 * Checks every published puzzle against its graph file: endpoints exist, a
 * chain of at least two links connects them, and — by replaying the shortest
 * solution through the real game engine, typing each name exactly as a player
 * would — that the chain is actually solvable. Exits non-zero on any problem
 * so CI never publishes a broken puzzle.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CATEGORY_ORDER } from '../src/categories/config'
import { initialChainState, routeToEnd, solutionPath, submitGuess } from '../src/engine/chainEngine'
import { puzzleNumberForDate } from '../src/engine/dailyIndex'
import { expandGraph, type ExpandedGraph, type GraphFile, type PuzzleFile } from '../src/engine/graphFormat'
import type { Puzzle } from '../src/engine/types'

const PUBLIC = join(import.meta.dirname, '..', 'public')
const graphs = new Map<string, ExpandedGraph | null>()
let errors = 0
let checked = 0

function fail(where: string, message: string) {
  errors++
  console.error(`✗ ${where}: ${message}`)
}

function loadGraph(path: string): ExpandedGraph | null {
  if (!graphs.has(path)) {
    const file = join(PUBLIC, path)
    if (!existsSync(file)) {
      graphs.set(path, null)
    } else {
      const graph = expandGraph(JSON.parse(readFileSync(file, 'utf-8')) as GraphFile)
      for (const e of graph.edges) {
        if (graph.nodes[e.a]?.type !== 'person' || graph.nodes[e.b]?.type !== 'work') fail(path, `bad link ${e.a} - ${e.b}`)
      }
      graphs.set(path, graph)
    }
  }
  return graphs.get(path)!
}

function validatePuzzle(where: string, file: PuzzleFile, category: string, date: string) {
  if (file.date !== date) fail(where, `date field ${file.date} doesn't match file name`)
  if (file.category !== category) fail(where, `category field ${file.category} doesn't match folder`)
  if (file.number !== puzzleNumberForDate(date)) fail(where, `number ${file.number} should be ${puzzleNumberForDate(date)}`)
  if (category === 'athletes-teams' && !file.tag) fail(where, 'sports puzzle has no league tag')
  if (!file.graph) return fail(where, 'no graph file referenced')

  const graph = loadGraph(file.graph)
  if (!graph) return fail(where, `graph file ${file.graph} is missing`)
  for (const id of [file.start, file.end]) {
    if (graph.nodes[id]?.type !== 'person') return fail(where, `endpoint ${id} missing from ${file.graph} or not a person`)
  }
  if (file.start === file.end) return fail(where, 'start and end are the same')

  const puzzle: Puzzle = { ...file, ...graph, parMoves: 0 }
  const shortest = routeToEnd(puzzle, [puzzle.start], new Set())
  if (!shortest) return fail(where, 'no chain connects start to end')
  puzzle.parMoves = shortest.length - 1
  if (puzzle.parMoves < 4) fail(where, `start and end share a ${puzzle.nodes[shortest[1]].name} link directly`)

  // Play the shortest solution by typing each name exactly.
  let state = initialChainState(puzzle)
  for (const id of solutionPath(puzzle).slice(1)) {
    const result = submitGuess(puzzle, state, puzzle.nodes[id].name)
    if (result.feedback.kind !== 'recorded' || result.feedback.record.outcome !== 'correct') {
      const got = result.feedback.kind === 'recorded' ? result.feedback.record.outcome : result.feedback.kind
      return fail(where, `typing "${puzzle.nodes[id].name}" along the solution gave "${got}"`)
    }
    state = result.state
  }
  if (!state.won) fail(where, 'replaying the solution did not win')
}

for (const category of CATEGORY_ORDER) {
  const indexPath = join(PUBLIC, 'puzzles', category, 'index.json')
  if (!existsSync(indexPath)) {
    fail(category, 'index.json is missing')
    continue
  }
  const dates: string[] = JSON.parse(readFileSync(indexPath, 'utf-8'))
  if (dates.length === 0) fail(category, 'no puzzles listed')
  for (const date of dates) {
    const where = `${category}/${date}`
    const path = join(PUBLIC, 'puzzles', category, `${date}.json`)
    if (!existsSync(path)) {
      fail(where, 'listed in index.json but the file is missing')
      continue
    }
    try {
      validatePuzzle(where, JSON.parse(readFileSync(path, 'utf-8')), category, date)
    } catch (e) {
      fail(where, `could not be checked: ${(e as Error).message}`)
    }
    checked++
  }
}

console.log(`${checked} puzzles checked, ${errors} problem${errors === 1 ? '' : 's'}.`)
process.exit(errors ? 1 : 0)

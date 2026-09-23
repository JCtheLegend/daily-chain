import type { CategoryId, Puzzle } from './types'
import { todayDateString } from './dailyIndex'
import { expandGraph, type ExpandedGraph, type GraphFile, type PuzzleFile } from './graphFormat'
import { routeToEnd } from './chainEngine'

const base = import.meta.env.BASE_URL
const graphs = new Map<string, Promise<ExpandedGraph>>()

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(path)
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`)
  return res.json() as Promise<T>
}

function loadGraph(path: string): Promise<ExpandedGraph> {
  let graph = graphs.get(path)
  if (!graph) {
    graph = fetchJson<GraphFile>(`${base}${path}`).then(expandGraph)
    graphs.set(path, graph)
  }
  return graph
}

/** Dates (YYYY-MM-DD, ascending) for which a puzzle exists in this category. */
export async function loadAvailableDates(category: CategoryId): Promise<string[]> {
  return fetchJson<string[]>(`${base}puzzles/${category}/index.json`)
}

export async function loadPuzzle(category: CategoryId, date: string): Promise<Puzzle> {
  const file = await fetchJson<PuzzleFile>(`${base}puzzles/${category}/${date}.json`)
  const { nodes, edges, extras } = await loadGraph(file.graph)
  if (!nodes[file.start] || !nodes[file.end]) throw new Error(`Puzzle ${category}/${date} refers to people missing from its graph`)

  const puzzle: Puzzle = { ...file, nodes, edges, extras, parMoves: 0 }
  const shortest = routeToEnd(puzzle, [puzzle.start], new Set())
  if (!shortest) throw new Error(`Puzzle ${category}/${date} has no chain`)
  puzzle.parMoves = shortest.length - 1
  return puzzle
}

/**
 * Loads today's puzzle. If today's file isn't published yet (generation runs
 * on a schedule), falls back to the most recent available date so the game
 * never shows a hard error.
 */
export async function loadTodaysPuzzle(category: CategoryId): Promise<Puzzle> {
  const dates = await loadAvailableDates(category)
  if (dates.length === 0) throw new Error(`No puzzles published for ${category} yet`)
  const today = todayDateString()
  const date = dates.includes(today) ? today : [...dates].sort().filter((d) => d <= today).pop() ?? dates[0]
  return loadPuzzle(category, date)
}

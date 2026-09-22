import 'dotenv/config'
import { fetchJsonCached, createRateLimiter } from './shared/fetchUtil'
import { buildBipartiteGraph, pickPuzzlePair, subgraphAroundPath, type RawNode } from './shared/graph'
import { writePuzzle, usedPairs, nextStartDate } from './shared/writePuzzle'

const API_KEY = process.env.TMDB_API_KEY
const BASE = 'https://api.themoviedb.org/3'
const rateLimit = createRateLimiter(60) // TMDb's limit is generous; this just keeps us polite

const MAX_CAST_PER_MOVIE = 12
const MAX_MOVIES_PER_PERSON = 15
const MIN_VOTE_COUNT = 200 // filters out obscure/low-signal titles
const SEED_COUNT = 15
const MAX_GRAPH_NODES = 1500

interface TmdbMovieCredit {
  id: number
  title: string
  release_date?: string
  vote_count?: number
  popularity?: number
}
interface TmdbCastCredit {
  id: number
  name: string
  order?: number
}

function movieNodeId(id: number): string {
  return `tmdb-m-${id}`
}
function personNodeId(id: number): string {
  return `tmdb-p-${id}`
}

async function tmdbGet<T>(path: string): Promise<T> {
  await rateLimit()
  const sep = path.includes('?') ? '&' : '?'
  return fetchJsonCached<T>(`${BASE}${path}${sep}api_key=${API_KEY}`)
}

async function worksOfPerson(personId: string): Promise<RawNode[]> {
  const tmdbId = personId.replace('tmdb-p-', '')
  const data = await tmdbGet<{ cast: TmdbMovieCredit[] }>(`/person/${tmdbId}/movie_credits`)
  return (data.cast ?? [])
    .filter((m) => (m.vote_count ?? 0) >= MIN_VOTE_COUNT && m.release_date)
    .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))
    .slice(0, MAX_MOVIES_PER_PERSON)
    .map((m) => ({
      id: movieNodeId(m.id),
      name: m.title,
      type: 'work' as const,
      subtitle: m.release_date?.slice(0, 4),
    }))
}

async function peopleOfWork(workId: string): Promise<RawNode[]> {
  const tmdbId = workId.replace('tmdb-m-', '')
  const data = await tmdbGet<{ cast: TmdbCastCredit[] }>(`/movie/${tmdbId}/credits`)
  return (data.cast ?? [])
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
    .slice(0, MAX_CAST_PER_MOVIE)
    .map((p) => ({ id: personNodeId(p.id), name: p.name, type: 'person' as const }))
}

async function getSeeds(count: number): Promise<RawNode[]> {
  const seeds: RawNode[] = []
  for (let page = 1; seeds.length < count && page <= 5; page++) {
    const data = await tmdbGet<{ results: { id: number; name: string }[] }>(`/person/popular?page=${page}`)
    for (const p of data.results) seeds.push({ id: personNodeId(p.id), name: p.name, type: 'person' })
  }
  return seeds.slice(0, count)
}

export async function main() {
  if (!API_KEY) {
    console.log('TMDB_API_KEY is not set — skipping actors-movies generation.')
    console.log('Get a free key at https://www.themoviedb.org/settings/api and set it as an env var to enable this category.')
    return
  }

  const count = Number(process.argv.find((a) => a.startsWith('--count='))?.split('=')[1] ?? 30)
  const startDateArg = process.argv.find((a) => a.startsWith('--start-date='))?.split('=')[1]

  console.log('Fetching seed actors from TMDb...')
  const seeds = await getSeeds(SEED_COUNT)
  const seedIds = new Set(seeds.map((s) => s.id))
  console.log(`Seeds: ${seeds.map((s) => s.name).join(', ')}`)

  console.log('Crawling actor/movie graph...')
  const { nodes, edges } = await buildBipartiteGraph({
    seeds,
    maxNodes: MAX_GRAPH_NODES,
    worksOfPerson,
    peopleOfWork,
    onProgress: (p) => {
      if (p.visited % 20 === 0) console.log(`  visited ${p.visited}, nodes ${p.nodes}, queued ${p.queued}`)
    },
  })
  console.log(`Graph: ${Object.keys(nodes).length} nodes, ${edges.length} edges`)

  const exclude = usedPairs('actors-movies')
  const date0 = new Date(`${startDateArg ?? nextStartDate('actors-movies')}T00:00:00Z`)
  const endpointFilter = (id: string) => seedIds.has(id)

  let written = 0
  for (let i = 0; written < count && i < count * 5; i++) {
    const pair = pickPuzzlePair(nodes, edges, { minPar: 4, maxPar: 8, excludePairs: exclude, endpointFilter })
    if (!pair) {
      console.warn('No more valid pairs found; stopping early.')
      break
    }
    const pairKey = pair.start < pair.end ? `${pair.start}|${pair.end}` : `${pair.end}|${pair.start}`
    exclude.add(pairKey)

    const sub = subgraphAroundPath(nodes, edges, pair.path, 2, 150)
    const date = new Date(date0)
    date.setUTCDate(date.getUTCDate() + written)
    const dateStr = date.toISOString().slice(0, 10)

    writePuzzle({
      category: 'actors-movies',
      date: dateStr,
      start: pair.start,
      end: pair.end,
      nodes: sub.nodes,
      edges: sub.edges,
      parMoves: pair.path.length - 1,
    })
    written++
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}

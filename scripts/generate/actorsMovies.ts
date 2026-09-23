import 'dotenv/config'
import { createRateLimiter, fetchJsonCached, pMap, WEEK_MS } from './shared/fetchUtil'
import { GraphBuilder, titleAliases } from './shared/graph'
import { generateSeries } from './shared/series'

const API_KEY = process.env.TMDB_API_KEY
const BASE = 'https://api.themoviedb.org/3'
const rateLimit = createRateLimiter(30) // TMDb allows ~50 req/s

const DISCOVER_PAGES = 15 // 20 movies per page, most-voted first
const STARS_PER_MOVIE = 3
const MOVIES_PER_ACTOR = 15
const CAST_PER_MOVIE = 15
const GRAPH_MIN_VOTES = 500 // links in the puzzle graph use well-known movies only
const EXTRA_MIN_VOTES = 100 // "real, but not today" recognition accepts much more
const DOCUMENTARY = 99

// A puzzle endpoint must have led (top-5 billing) several widely seen movies.
const STAR_MOVIE_MIN_VOTES = 2000
const STAR_MAX_BILLING = 4
const MIN_STAR_MOVIES = 4
const ENDPOINT_POOL_SIZE = 150

interface MovieCredit {
  id: number
  title: string
  release_date?: string
  vote_count?: number
  genre_ids?: number[]
  character?: string
  order?: number
}
interface CastCredit {
  id: number
  name: string
  order?: number
  character?: string
  known_for_department?: string
}

async function tmdb<T>(path: string): Promise<T> {
  await rateLimit()
  const sep = path.includes('?') ? '&' : '?'
  return fetchJsonCached<T>(`${BASE}${path}${sep}api_key=${API_KEY}`, { maxAgeMs: 4 * WEEK_MS })
}

/** Cameos as themselves, archive footage and uncredited bits don't count as being "in" a movie. */
function isRealRole(character: string | undefined): boolean {
  return !/\b(himself|herself|themselves|self)\b|archive footage|uncredited|voice \(uncredited\)/i.test(character ?? '')
}

export async function main() {
  if (!API_KEY) {
    console.log('TMDB_API_KEY is not set — skipping actors-movies generation.')
    return
  }

  const g = new GraphBuilder()
  const extraNames = new Map<string, string[]>()
  const personId = (id: number) => `tmdb-p-${id}`
  const movieId = (id: number) => `tmdb-m-${id}`

  console.log('Finding the stars of the most-voted movies...')
  const pages = await pMap(Array.from({ length: DISCOVER_PAGES }, (_, i) => i + 1), 4, (page) =>
    tmdb<{ results: { id: number }[] }>(`/discover/movie?sort_by=vote_count.desc&page=${page}`),
  )
  const topMovies = pages.flatMap((p) => p.results.map((r) => r.id))
  const castLists = await pMap(topMovies, 8, (id) => tmdb<{ cast: CastCredit[] }>(`/movie/${id}/credits`))
  const stars = new Map<number, string>()
  for (const { cast } of castLists) {
    for (const c of [...cast].sort((a, b) => (a.order ?? 99) - (b.order ?? 99)).slice(0, STARS_PER_MOVIE)) {
      if (c.known_for_department === 'Acting' && isRealRole(c.character)) stars.set(c.id, c.name)
    }
  }
  console.log(`${stars.size} stars`)

  console.log('Fetching filmographies...')
  const filmographies = await pMap([...stars], 8, async ([id, name]) => ({
    id,
    name,
    credits: (await tmdb<{ cast: MovieCredit[] }>(`/person/${id}/movie_credits`)).cast ?? [],
  }))
  const movies = new Map<number, MovieCredit>()
  const starPower = new Map<string, number>()
  for (const { id, name, credits } of filmographies) {
    const roles = credits.filter((m) => m.release_date && !m.genre_ids?.includes(DOCUMENTARY) && isRealRole(m.character))
    const leads = new Set(
      roles.filter((m) => (m.vote_count ?? 0) >= STAR_MOVIE_MIN_VOTES && (m.order ?? 99) <= STAR_MAX_BILLING).map((m) => m.id),
    )
    starPower.set(personId(id), leads.size)
    g.addNode({ id: personId(id), name, type: 'person' })
    extraNames.set(personId(id), [...new Set(roles.filter((m) => (m.vote_count ?? 0) >= EXTRA_MIN_VOTES).map((m) => m.title))])
    for (const m of roles
      .filter((m) => (m.vote_count ?? 0) >= GRAPH_MIN_VOTES)
      .sort((a, b) => (b.vote_count ?? 0) - (a.vote_count ?? 0))
      .slice(0, MOVIES_PER_ACTOR)) {
      movies.set(m.id, m)
    }
  }

  console.log(`Fetching casts of ${movies.size} movies...`)
  const casts = await pMap([...movies.values()], 8, async (m) => ({
    movie: m,
    cast: (await tmdb<{ cast: CastCredit[] }>(`/movie/${m.id}/credits`)).cast ?? [],
  }))
  for (const { movie, cast } of casts) {
    const roles = cast.filter((c) => isRealRole(c.character)).sort((a, b) => (a.order ?? 99) - (b.order ?? 99))
    g.addNode({
      id: movieId(movie.id),
      name: movie.title,
      aliases: titleAliases(movie.title),
      type: 'work',
      subtitle: movie.release_date?.slice(0, 4),
      year: Number(movie.release_date?.slice(0, 4)) || undefined,
    })
    // Stars are linked to every graph movie they're really in, not just the top-billed few.
    for (const c of roles) {
      if (roles.indexOf(c) < CAST_PER_MOVIE || stars.has(c.id)) {
        g.addNode({ id: personId(c.id), name: c.name, type: 'person' })
        g.link(personId(c.id), movieId(movie.id))
      }
    }
  }

  const movieCount = Object.values(g.nodes).filter((n) => n.type === 'work').length
  console.log(`Graph: ${Object.keys(g.nodes).length - movieCount} actors, ${movieCount} movies, ${g.edges.length} roles`)

  const starIds = new Set(
    [...starPower]
      .filter(([, n]) => n >= MIN_STAR_MOVIES)
      .sort((a, b) => b[1] - a[1])
      .slice(0, ENDPOINT_POOL_SIZE)
      .map(([id]) => id),
  )
  console.log(`${starIds.size} endpoint candidates, e.g. ${[...starIds].slice(0, 10).map((id) => g.nodes[id].name).join(', ')}`)
  const context = { name: 'actors-movies', nodes: g.nodes, edges: g.edges, isEndpoint: (id: string) => starIds.has(id), extraNames }
  generateSeries({ category: 'actors-movies', contexts: [context], contextFor: () => context })
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}

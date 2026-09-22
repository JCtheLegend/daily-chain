import 'dotenv/config'
import { fetchJsonCached, createRateLimiter } from './shared/fetchUtil'
import { buildBipartiteGraph, pickPuzzlePair, subgraphAroundPath, type RawNode } from './shared/graph'
import { writePuzzle, usedPairs, nextStartDate } from './shared/writePuzzle'

const BASE = 'https://musicbrainz.org/ws/2'
const USER_AGENT = 'ChainlyGameDataBot/0.1 (https://github.com/) - free daily-puzzle game data generation'
// MusicBrainz's unauthenticated rate limit is strictly 1 req/sec.
const rateLimit = createRateLimiter(1100)

const MAX_SONGS_PER_ARTIST = 12
const MAX_GRAPH_NODES = 600

// Well-known, feature-heavy artists across genres, used as BFS seeds and as
// the only allowed puzzle start/end points (co-artists discovered along the
// way can be less famous — they're the connectors, not the answer).
const SEED_ARTIST_NAMES = [
  'Beyoncé', 'Jay-Z', 'Rihanna', 'Drake', 'Eminem', 'Justin Bieber',
  'Ariana Grande', 'Ed Sheeran', 'Nicki Minaj', 'Kanye West', 'Travis Scott',
  'Cardi B', 'Post Malone', 'The Weeknd', 'Dua Lipa', 'Bruno Mars',
  'Taylor Swift', 'Katy Perry', 'Chris Brown', 'Lil Wayne',
]

interface MbArtistCredit {
  name: string
  artist: { id: string; name: string; type?: string }
}
interface MbRecording {
  id: string
  title: string
  'first-release-date'?: string
  'artist-credit'?: MbArtistCredit[]
}

async function mbGet<T>(path: string): Promise<T> {
  await rateLimit()
  return fetchJsonCached<T>(`${BASE}${path}`, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } })
}

function artistNodeId(mbid: string): string {
  return `mb-a-${mbid}`
}
function recordingNodeId(mbid: string): string {
  return `mb-r-${mbid}`
}

function isValidCredit(c: MbArtistCredit): boolean {
  return !!c.artist?.id && c.artist.name !== '[unknown]' && c.artist.type !== 'Other'
}

/** Populated by worksOfPerson so peopleOfWork can answer without a second HTTP call — the artist-credit list already names every collaborator. */
const recordingCreditsCache = new Map<string, RawNode[]>()

async function worksOfPerson(personId: string): Promise<RawNode[]> {
  const mbid = personId.replace('mb-a-', '')
  const data = await mbGet<{ recordings?: MbRecording[] }>(
    `/recording?artist=${mbid}&fmt=json&limit=50&inc=artist-credits`,
  )
  const works: RawNode[] = []
  for (const rec of data.recordings ?? []) {
    const credits = (rec['artist-credit'] ?? []).filter(isValidCredit)
    if (credits.length < 2) continue // only actual collaborations are useful connectors
    const workId = recordingNodeId(rec.id)
    if (recordingCreditsCache.has(workId)) continue
    recordingCreditsCache.set(
      workId,
      credits.map((c) => ({ id: artistNodeId(c.artist.id), name: c.artist.name, type: 'person' as const })),
    )
    works.push({
      id: workId,
      name: rec.title,
      type: 'work',
      subtitle: rec['first-release-date']?.slice(0, 4),
    })
    if (works.length >= MAX_SONGS_PER_ARTIST) break
  }
  return works
}

async function peopleOfWork(workId: string): Promise<RawNode[]> {
  return recordingCreditsCache.get(workId) ?? []
}

async function resolveSeedArtist(name: string): Promise<RawNode | null> {
  const data = await mbGet<{ artists?: { id: string; name: string; score: number }[] }>(
    `/artist?query=${encodeURIComponent(`artist:${name}`)}&fmt=json&limit=1`,
  )
  const hit = data.artists?.[0]
  if (!hit) return null
  return { id: artistNodeId(hit.id), name: hit.name, type: 'person' }
}

export async function main() {
  const count = Number(process.argv.find((a) => a.startsWith('--count='))?.split('=')[1] ?? 30)
  const startDateArg = process.argv.find((a) => a.startsWith('--start-date='))?.split('=')[1]

  console.log('Resolving seed artist MBIDs...')
  const seeds: RawNode[] = []
  for (const name of SEED_ARTIST_NAMES) {
    const seed = await resolveSeedArtist(name)
    if (seed) seeds.push(seed)
    else console.warn(`Could not resolve seed artist: ${name}`)
  }
  const seedIds = new Set(seeds.map((s) => s.id))
  console.log(`Resolved ${seeds.length}/${SEED_ARTIST_NAMES.length} seeds.`)

  console.log('Crawling artist/song collaboration graph (this respects MusicBrainz\'s 1 req/sec limit, so it takes a few minutes)...')
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

  const exclude = usedPairs('artists-songs')
  const date0 = new Date(`${startDateArg ?? nextStartDate('artists-songs')}T00:00:00Z`)
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
      category: 'artists-songs',
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

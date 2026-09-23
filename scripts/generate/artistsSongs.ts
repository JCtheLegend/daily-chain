import 'dotenv/config'
import { createRateLimiter, fetchJsonCached, pMap, WEEK_MS } from './shared/fetchUtil'
import { GraphBuilder, titleAliases } from './shared/graph'
import { generateSeries } from './shared/series'

const API = 'https://api.deezer.com'
// Deezer allows 50 requests / 5 seconds per IP.
const rateLimit = createRateLimiter(125)

// Well-known artists across genres. They seed the crawl and are the only
// allowed puzzle start/end points; collaborators found along the way can be
// less famous — they're connectors, not answers.
const SEED_ARTISTS = [
  'Taylor Swift', 'Ariana Grande', 'Justin Bieber', 'Ed Sheeran', 'Dua Lipa', 'Katy Perry', 'Lady Gaga', 'Rihanna',
  'Beyoncé', 'Bruno Mars', 'Selena Gomez', 'Miley Cyrus', 'Shawn Mendes', 'Camila Cabello', 'Sia', 'Halsey',
  'Billie Eilish', 'Olivia Rodrigo', 'Harry Styles', 'Charli xcx', 'Sabrina Carpenter', 'Doja Cat', 'Lizzo',
  'Jason Derulo', 'Pitbull', 'Demi Lovato', 'Britney Spears', 'Christina Aguilera', 'Jennifer Lopez',
  'Kelly Clarkson', 'P!nk', 'Justin Timberlake', 'Usher', 'Maroon 5', 'Coldplay', 'Imagine Dragons', 'OneRepublic',
  'The Chainsmokers', 'Calvin Harris', 'David Guetta', 'Marshmello', 'Avicii', 'Kygo', 'Zedd', 'Major Lazer',
  'DJ Snake', 'Diplo', 'Mark Ronson', 'Drake', 'Kanye West', 'JAY-Z', 'Eminem', 'Nicki Minaj', 'Cardi B',
  'Travis Scott', 'Post Malone', 'Kendrick Lamar', 'J. Cole', 'Lil Wayne', 'Future', 'Lil Baby', '21 Savage',
  'Megan Thee Stallion', 'Snoop Dogg', '50 Cent', 'Chris Brown', 'The Weeknd', 'SZA', 'Khalid', 'DJ Khaled',
  'Young Thug', 'Lil Nas X', 'Jack Harlow', 'Ludacris', 'T.I.', 'Kid Cudi', 'Pharrell Williams', 'Missy Elliott',
  'Nelly', 'Akon', 'Ne-Yo', 'Wiz Khalifa', 'Mac Miller', 'A$AP Rocky', 'Tyler, The Creator', 'Childish Gambino',
  'Swae Lee', 'Ty Dolla $ign', 'Lil Uzi Vert', 'Juice WRLD', 'Alicia Keys', 'John Legend', 'Mariah Carey',
  'Bad Bunny', 'J Balvin', 'Shakira', 'Daddy Yankee', 'Karol G', 'Ozuna', 'Maluma', 'Luis Fonsi', 'Morgan Wallen',
  'Luke Combs', 'Florida Georgia Line', 'Blake Shelton', 'Carrie Underwood', 'Keith Urban', 'Linkin Park',
]
const MAX_EXPANDED_ARTISTS = 300

interface DzArtist {
  id: number
  name: string
  nb_fan?: number
}
interface DzTrack {
  id: number
  title: string
  title_short?: string
  contributors?: DzArtist[]
}

async function dz<T>(path: string): Promise<T> {
  await rateLimit()
  const data = await fetchJsonCached<T & { error?: { message: string } }>(`${API}${path}`, { maxAgeMs: 4 * WEEK_MS })
  if (data.error) throw new Error(`Deezer ${path}: ${data.error.message}`)
  return data
}

/** Label/placeholder credits that aren't real performers and would act as bogus hubs. */
function isPseudoArtist(name: string): boolean {
  return /^(disney|various artists)$/i.test(name.trim()) || /\bcast\b/i.test(name)
}

function norm(s: string): string {
  return s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')
}

/** "One Dance (feat. Kyla & Wizkid) [Remastered]" -> "One Dance" */
function cleanTitle(track: DzTrack): string {
  return (track.title_short || track.title)
    .replace(/\s*[([](feat\.?|ft\.?|featuring|with)\s[^)\]]*[)\]]/gi, '')
    .replace(/\s*[([][^)\]]*(version|remaster|edit|explicit|from |motion picture|soundtrack)[^)\]]*[)\]]/gi, '')
    .replace(/\s+(feat\.?|ft\.?|featuring)\s.+$/i, '')
    .trim()
}

/** Guessable short forms: "Levitating [The Blessed Madonna Remix]" also answers to "Levitating". */
function songAliases(title: string): string[] | undefined {
  const bare = title.replace(/\s*[([][^)\]]*[)\]]/g, '').trim()
  const aliases = new Set([...(titleAliases(title) ?? []), ...(bare && bare !== title ? [bare] : [])])
  return aliases.size ? [...aliases] : undefined
}

async function resolveArtist(name: string): Promise<DzArtist | null> {
  const { data } = await dz<{ data: DzArtist[] }>(`/search/artist?q=${encodeURIComponent(name)}&limit=10`)
  // Search isn't ordered by popularity, and impostor profiles share famous names — take the most-followed exact match.
  const exact = data.filter((a) => norm(a.name) === norm(name))
  const pick = (exact.length ? exact : data).sort((a, b) => (b.nb_fan ?? 0) - (a.nb_fan ?? 0))[0]
  return pick ?? null
}

async function topTracks(artistId: number): Promise<DzTrack[]> {
  const { data } = await dz<{ data: DzTrack[] }>(`/artist/${artistId}/top?limit=100`)
  return data ?? []
}

export async function main() {
  console.log('Resolving seed artists on Deezer...')
  const seeds = (await pMap(SEED_ARTISTS, 4, resolveArtist)).filter((a): a is DzArtist => !!a)
  console.log(`Resolved ${seeds.length}/${SEED_ARTISTS.length}`)

  const g = new GraphBuilder()
  const songKeys = new Map<string, string>() // de-dupes the same song released on several albums
  const extraNames = new Map<string, string[]>()
  const fetched = new Set<number>()
  const collabCounts = new Map<number, { artist: DzArtist; count: number }>()
  const personId = (id: number) => `dz-a-${id}`

  async function crawl(artists: DzArtist[]) {
    const results = await pMap(artists, 4, async (a) => ({ artist: a, tracks: await topTracks(a.id) }))
    for (const { artist, tracks } of results) {
      fetched.add(artist.id)
      g.addNode({ id: personId(artist.id), name: artist.name, type: 'person' })
      extraNames.set(personId(artist.id), [...new Set(tracks.map(cleanTitle))])

      for (const track of tracks) {
        const contributors = (track.contributors ?? []).filter((c) => !isPseudoArtist(c.name))
        const unique = [...new Map(contributors.map((c) => [c.id, c])).values()]
        if (unique.length < 2) continue
        const title = cleanTitle(track)
        const key = `${norm(title)}|${unique.map((c) => c.id).sort().join(',')}`
        let workId = songKeys.get(key)
        if (!workId) {
          workId = `dz-t-${track.id}`
          songKeys.set(key, workId)
          g.addNode({ id: workId, name: title, aliases: songAliases(title), type: 'work' })
        }
        for (const c of unique) {
          g.addNode({ id: personId(c.id), name: c.name, type: 'person' })
          g.link(personId(c.id), workId)
          if (c.id !== artist.id && !fetched.has(c.id)) {
            const entry = collabCounts.get(c.id) ?? { artist: c, count: 0 }
            entry.count++
            collabCounts.set(c.id, entry)
          }
        }
      }
    }
  }

  // Show seeds under their familiar spelling ("JAY-Z", not Deezer's "JAŸ-Z").
  seeds.forEach((s, i) => {
    const familiar = SEED_ARTISTS[i]
    g.addNode({ id: personId(s.id), name: familiar, aliases: s.name !== familiar ? [s.name] : undefined, type: 'person' })
  })

  console.log('Fetching seed artists’ top tracks...')
  await crawl(seeds)

  const frequentCollaborators = [...collabCounts.values()]
    .filter((c) => c.count >= 2 && !fetched.has(c.artist.id))
    .sort((a, b) => b.count - a.count)
    .slice(0, MAX_EXPANDED_ARTISTS)
    .map((c) => c.artist)
  console.log(`Expanding to ${frequentCollaborators.length} frequent collaborators...`)
  await crawl(frequentCollaborators)

  const songs = Object.values(g.nodes).filter((n) => n.type === 'work').length
  console.log(`Graph: ${Object.keys(g.nodes).length - songs} artists, ${songs} songs, ${g.edges.length} credits`)

  const seedIds = new Set(seeds.map((s) => personId(s.id)))
  const context = { name: 'artists-songs', nodes: g.nodes, edges: g.edges, isEndpoint: (id: string) => seedIds.has(id), extraNames }
  generateSeries({ category: 'artists-songs', contexts: [context], contextFor: () => context })
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}

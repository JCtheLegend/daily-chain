import 'dotenv/config'
import { puzzleNumberForDate } from '../../src/engine/dailyIndex'
import { GraphBuilder } from './shared/graph'
import { generateSeries, type GraphContext } from './shared/series'
import { seasonLabel, sitelinksByExternalId, type League, type RosterEntry } from './sports/common'
import { mlbRosters } from './sports/mlb'
import { nbaRosters } from './sports/nba'
import { nflRosters } from './sports/nfl'
import { nhlRosters } from './sports/nhl'

const LEAGUES: League[] = ['NBA', 'NFL', 'MLB', 'NHL']
// Sitelinks alone over-rate players famous for something else (an Olympian
// with a two-year MLB stint), so endpoints also need a real career.
const ENDPOINT_POOL_SIZE = 80
const MIN_ENDPOINT_SITELINKS = 8
const MIN_ENDPOINT_SEASONS = 5

/**
 * Team-season graph: players link to "<team> <season>" nodes, so two players
 * are only connected through a team if they were on it in the same season.
 */
function buildLeagueContext(league: League, entries: RosterEntry[], fame: (playerId: string) => number): GraphContext {
  const g = new GraphBuilder()
  const seasons = new Map<string, number>()

  for (const e of entries) {
    const personId = `${league}-p-${e.playerId}`
    const workId = `${league}-t-${e.teamKey}-${e.season}`
    g.addNode({ id: personId, name: e.playerName, type: 'person' })
    g.addNode({ id: workId, name: e.teamName, aliases: e.teamAliases, type: 'work', subtitle: seasonLabel(league, e.season), year: e.season })
    g.link(personId, workId)
    seasons.set(personId, (seasons.get(personId) ?? 0) + 1)
  }

  const pool = new Set(
    [...seasons.keys()]
      .map((id) => ({ id, fame: fame(id.slice(`${league}-p-`.length)) }))
      .filter((p) => p.fame >= MIN_ENDPOINT_SITELINKS && (seasons.get(p.id) ?? 0) >= MIN_ENDPOINT_SEASONS)
      .sort((a, b) => b.fame - a.fame)
      .slice(0, ENDPOINT_POOL_SIZE)
      .map((p) => p.id),
  )
  const people = [...seasons.keys()].length
  console.log(`${league}: ${people} players, ${Object.keys(g.nodes).length - people} team-seasons, ${g.edges.length} links, ${pool.size} endpoint candidates`)
  console.log(`  e.g. ${[...pool].slice(0, 8).map((id) => g.nodes[id].name).join(', ')}`)

  return { nodes: g.nodes, edges: g.edges, isEndpoint: (id) => pool.has(id), tag: league }
}

export async function main() {
  console.log('Loading rosters...')
  const [nba, nfl, mlb, nhl] = [await nbaRosters(), await nflRosters(), await mlbRosters(), await nhlRosters()]

  console.log('Loading fame (Wikidata sitelinks)...')
  const [nbaFame, pfrFame, mlbFame, nhlFame] = [
    await sitelinksByExternalId('P3685'),
    await sitelinksByExternalId('P3561'),
    await sitelinksByExternalId('P3541'),
    await sitelinksByExternalId('P3522'),
  ]
  // Wikidata stores Pro-Football-Reference ids with their URL folder ("B/BradTo00").
  const pfrFameById = new Map([...pfrFame].map(([k, v]) => [k.split('/').pop()!, v]))

  const contexts: Record<League, GraphContext> = {
    NBA: buildLeagueContext('NBA', nba, (id) => nbaFame.get(id) ?? 0),
    NFL: buildLeagueContext('NFL', nfl.entries, (id) => pfrFameById.get(nfl.pfrIds.get(id) ?? '') ?? 0),
    MLB: buildLeagueContext('MLB', mlb, (id) => mlbFame.get(id) ?? 0),
    NHL: buildLeagueContext('NHL', nhl, (id) => nhlFame.get(id) ?? 0),
  }

  console.log('Generating puzzles (leagues rotate by day)...')
  generateSeries({
    category: 'athletes-teams',
    maxNodes: 300,
    contextFor: (date) => contexts[LEAGUES[puzzleNumberForDate(date) % LEAGUES.length]],
  })
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}

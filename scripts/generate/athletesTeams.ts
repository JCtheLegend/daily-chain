import 'dotenv/config'
import { puzzleNumberForDate } from '../../src/engine/dailyIndex'
import { GraphBuilder } from './shared/graph'
import { generateSeries, type GraphContext } from './shared/series'
import { sitelinksByExternalId, type League, type LeagueRosters } from './sports/common'
import { mlbRosters } from './sports/mlb'
import { nbaRosters } from './sports/nba'
import { nflRosters } from './sports/nfl'
import { nhlRosters } from './sports/nhl'

const LEAGUES: League[] = ['NBA', 'NFL', 'MLB', 'NHL']
// Sitelinks alone over-rate players famous for something else (an Olympian
// with a two-year MLB stint), so endpoints and connectors also need a career.
const ENDPOINT_POOL_SIZE = 80
const MIN_ENDPOINT_SEASONS = 5
// The middle of a puzzle's intended route must be someone a casual fan knows.
const CONNECTOR_POOL_SIZE = 250
const MIN_CONNECTOR_SEASONS = 3
const MIN_SITELINKS = 8

/**
 * Franchise graph: players link to each team they ever played for, any year.
 * Relocated/renamed franchises are one team, answering to all their names.
 */
function buildLeagueContext(league: League, rosters: LeagueRosters, fame: (playerId: string) => number): GraphContext {
  const g = new GraphBuilder()
  const seasons = new Map<string, Set<number>>()
  const teamNames = new Map<string, { latest: number; name: string; names: Set<string> }>()

  for (const e of rosters.entries) {
    const personId = `${league}-p-${e.playerId}`
    g.addNode({ id: personId, name: e.playerName, type: 'person' })
    g.link(personId, `${league}-t-${e.teamKey}`)
    seasons.set(personId, (seasons.get(personId) ?? new Set()).add(e.season))

    const team = teamNames.get(e.teamKey) ?? { latest: -1, name: e.teamName, names: new Set<string>() }
    if (e.season >= team.latest) Object.assign(team, { latest: e.season, name: e.teamName })
    team.names.add(e.teamName)
    for (const alias of e.teamAliases) team.names.add(alias)
    teamNames.set(e.teamKey, team)
  }
  for (const [key, team] of teamNames) {
    const aliases = [...team.names].filter((n) => n !== team.name)
    g.addNode({ id: `${league}-t-${key}`, name: team.name, aliases, type: 'work' })
  }

  // Wikipedia coverage plus a bonus for career length: a long, visible career
  // beats a brief one that's notable abroad (Olympians, national-team stars).
  const ranked = [...seasons.keys()]
    .filter((id) => rosters.careerCovered(id.slice(`${league}-p-`.length)))
    .map((id) => ({ id, fame: fame(id.slice(`${league}-p-`.length)), seasons: seasons.get(id)!.size }))
    .filter((p) => p.fame >= MIN_SITELINKS)
    .sort((a, b) => b.fame + b.seasons / 2 - (a.fame + a.seasons / 2))
  const endpoints = new Set(ranked.filter((p) => p.seasons >= MIN_ENDPOINT_SEASONS).slice(0, ENDPOINT_POOL_SIZE).map((p) => p.id))
  const connectors = new Set(ranked.filter((p) => p.seasons >= MIN_CONNECTOR_SEASONS).slice(0, CONNECTOR_POOL_SIZE).map((p) => p.id))

  console.log(`${league}: ${seasons.size} players, ${teamNames.size} franchises, ${g.edges.length} links, ${endpoints.size} endpoints, ${connectors.size} connectors`)
  console.log(`  endpoints e.g. ${[...endpoints].slice(0, 8).map((id) => g.nodes[id].name).join(', ')}`)

  return {
    name: `athletes-${league.toLowerCase()}`,
    nodes: g.nodes,
    edges: g.edges,
    isEndpoint: (id) => endpoints.has(id),
    isConnector: (id) => connectors.has(id),
    tag: league,
  }
}

export async function main() {
  console.log('Loading rosters...')
  const [nba, nfl, mlb, nhl] = [await nbaRosters(), await nflRosters(), await mlbRosters(), await nhlRosters()]

  console.log('Loading fame (Wikidata sitelinks)...')
  const [nbaFame, pfrFame, mlbFame, nhlFame] = [
    await sitelinksByExternalId('P2685'), // Basketball-Reference player ID
    await sitelinksByExternalId('P3561'), // Pro-Football-Reference player ID
    await sitelinksByExternalId('P3541'), // MLB.com player ID
    await sitelinksByExternalId('P3522'), // NHL.com player ID
  ]

  const contexts: Record<League, GraphContext> = {
    NBA: buildLeagueContext('NBA', nba, (id) => nbaFame.get(id) ?? 0),
    NFL: buildLeagueContext('NFL', nfl, (id) => pfrFame.get(nfl.pfrIds.get(id) ?? '') ?? 0),
    MLB: buildLeagueContext('MLB', mlb, (id) => mlbFame.get(id) ?? 0),
    NHL: buildLeagueContext('NHL', nhl, (id) => nhlFame.get(id) ?? 0),
  }

  console.log('Generating puzzles (leagues rotate by day, exactly 2 links)...')
  generateSeries({
    category: 'athletes-teams',
    contexts: Object.values(contexts),
    contextFor: (date) => contexts[LEAGUES[puzzleNumberForDate(date) % LEAGUES.length]],
    maxPar: 4,
  })
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}

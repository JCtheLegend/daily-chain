import 'dotenv/config'
import type { PuzzleEdge, PuzzleNode } from '../../src/engine/types'
import { pickPuzzlePair, subgraphAroundPath } from './shared/graph'
import { fetchJsonCached } from './shared/fetchUtil'
import { writePuzzle, usedPairs, nextStartDate } from './shared/writePuzzle'

// NBA. Wikidata QID for "National Basketball Association" (P118 league value).
const LEAGUE_QID = 'Q155223'
const MIN_TENURE_START = '1990-01-01T00:00:00Z'
const SPARQL_ENDPOINT = 'https://query.wikidata.org/sparql'
const USER_AGENT = 'ChainlyGameDataBot/0.1 (https://github.com/) - free daily-puzzle game data generation'

interface SparqlBinding {
  player: { value: string }
  playerLabel: { value: string }
  team: { value: string }
  teamLabel: { value: string }
  start: { value: string }
  end: { value: string }
  sitelinks: { value: string }
}

/** Wikipedia+sister-project article count — used as a fame proxy so puzzle endpoints aren't obscure bench players. */
const MIN_ENDPOINT_SITELINKS = 30

async function runQuery(): Promise<SparqlBinding[]> {
  const query = `
    SELECT ?player ?playerLabel ?team ?teamLabel ?start ?end ?sitelinks WHERE {
      ?team wdt:P118 wd:${LEAGUE_QID} .
      ?player p:P54 ?stmt .
      ?stmt ps:P54 ?team .
      ?stmt pq:P580 ?start .
      ?stmt pq:P582 ?end .
      ?player wikibase:sitelinks ?sitelinks .
      ?player rdfs:label ?playerLabel . FILTER(LANG(?playerLabel)="en")
      ?team rdfs:label ?teamLabel . FILTER(LANG(?teamLabel)="en")
      FILTER(?start >= "${MIN_TENURE_START}"^^xsd:dateTime)
    }
  `
  const url = `${SPARQL_ENDPOINT}?query=${encodeURIComponent(query)}`
  const data = await fetchJsonCached<{ results: { bindings: SparqlBinding[] } }>(url, {
    headers: { Accept: 'application/sparql-results+json', 'User-Agent': USER_AGENT },
  })
  return data.results.bindings
}

function qidFromUri(uri: string): string {
  return uri.split('/').pop()!
}

/** NBA season "start year": Aug of year Y through Jul of year Y+1 is season Y. */
function seasonYear(date: Date): number {
  return date.getUTCMonth() >= 7 /* Aug (0-indexed) */ ? date.getUTCFullYear() : date.getUTCFullYear() - 1
}

function buildGraphFromBindings(
  rows: SparqlBinding[],
): { nodes: Record<string, PuzzleNode>; edges: PuzzleEdge[]; sitelinks: Map<string, number> } {
  const nodes: Record<string, PuzzleNode> = {}
  const edges: PuzzleEdge[] = []
  const edgeSet = new Set<string>()
  const sitelinks = new Map<string, number>()

  for (const row of rows) {
    const playerId = `wd-${qidFromUri(row.player.value)}`
    const teamQid = qidFromUri(row.team.value)
    const start = new Date(row.start.value)
    const end = new Date(row.end.value)
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue

    nodes[playerId] = { id: playerId, name: row.playerLabel.value, type: 'person' }
    sitelinks.set(playerId, Number(row.sitelinks.value))

    const fromSeason = seasonYear(start)
    const toSeason = Math.max(fromSeason, seasonYear(end))
    for (let year = fromSeason; year <= toSeason; year++) {
      const workId = `wd-${teamQid}-s${year}`
      nodes[workId] = {
        id: workId,
        name: row.teamLabel.value,
        type: 'work',
        subtitle: `${year}–${String((year + 1) % 100).padStart(2, '0')}`,
      }
      const key = playerId < workId ? `${playerId}|${workId}` : `${workId}|${playerId}`
      if (!edgeSet.has(key)) {
        edgeSet.add(key)
        edges.push({ a: playerId, b: workId })
      }
    }
  }

  return { nodes, edges, sitelinks }
}

export async function main() {
  const count = Number(process.argv.find((a) => a.startsWith('--count='))?.split('=')[1] ?? 30)
  const startDateArg = process.argv.find((a) => a.startsWith('--start-date='))?.split('=')[1]

  console.log('Querying Wikidata for NBA roster history (1990–present)...')
  const rows = await runQuery()
  console.log(`Got ${rows.length} dated tenure records.`)

  const { nodes, edges, sitelinks } = buildGraphFromBindings(rows)
  console.log(`Graph: ${Object.keys(nodes).length} nodes, ${edges.length} edges`)
  const endpointFilter = (id: string) => (sitelinks.get(id) ?? 0) >= MIN_ENDPOINT_SITELINKS

  const exclude = usedPairs('athletes-teams')
  const date0 = new Date(`${startDateArg ?? nextStartDate('athletes-teams')}T00:00:00Z`)

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
      category: 'athletes-teams',
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

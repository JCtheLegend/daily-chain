import { fetchJsonCached, WEEK_MS } from '../shared/fetchUtil'

export type League = 'NBA' | 'NFL' | 'MLB' | 'NHL'

/** One player on one team in one season. Season = the year the season started. */
export interface RosterEntry {
  season: number
  teamKey: string
  teamName: string
  teamAliases: string[]
  playerId: string
  playerName: string
}

export const FIRST_SEASON = 2000

/** Seasons that span two calendar years get a "2009–10" label; the rest use the single year. */
export function seasonLabel(league: League, season: number): string {
  if (league === 'NBA' || league === 'NHL') return `${season}–${String((season + 1) % 100).padStart(2, '0')}`
  return String(season)
}

const MULTI_WORD_PLACES = [
  'New York', 'Los Angeles', 'San Jose', 'St. Louis', 'Tampa Bay', 'New Jersey', 'Las Vegas', 'Kansas City',
  'Golden State', 'Oklahoma City', 'San Antonio', 'San Diego', 'San Francisco', 'New England', 'New Orleans',
  'Green Bay', 'Salt Lake',
]

/** "Toronto Maple Leafs" -> "Maple Leafs", "St. Louis Blues" -> "Blues". */
export function nickname(fullName: string): string {
  const place = MULTI_WORD_PLACES.find((p) => fullName.startsWith(p + ' '))
  if (place) return fullName.slice(place.length + 1)
  const i = fullName.indexOf(' ')
  return i === -1 ? fullName : fullName.slice(i + 1)
}

export function teamAliases(fullName: string, ...extra: (string | undefined)[]): string[] {
  const set = new Set([nickname(fullName), ...extra.filter((x): x is string => !!x)])
  set.delete(fullName)
  return [...set]
}

/**
 * Wikipedia/Wikidata sitelink counts keyed by a league's own player ID, via an
 * external-ID property (e.g. P3541 = MLB.com player ID). Used as a fame proxy
 * so puzzle endpoints are players people have heard of. Queried on QLever,
 * which answers these whole-property scans in seconds.
 */
export async function sitelinksByExternalId(property: string): Promise<Map<string, number>> {
  const query = `PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX wikibase: <http://wikiba.se/ontology#>
SELECT ?id ?sl WHERE { ?p wdt:${property} ?id . ?p wikibase:sitelinks ?sl . }`
  const data = await fetchJsonCached<{ results: { bindings: { id: { value: string }; sl: { value: string } }[] } }>(
    'https://qlever.cs.uni-freiburg.de/api/wikidata',
    {
      method: 'POST',
      body: 'query=' + encodeURIComponent(query),
      headers: { Accept: 'application/sparql-results+json', 'Content-Type': 'application/x-www-form-urlencoded' },
      maxAgeMs: 4 * WEEK_MS,
    },
  )
  const map = new Map<string, number>()
  for (const row of data.results.bindings) {
    const id = row.id.value
    map.set(id, Math.max(map.get(id) ?? 0, Number(row.sl.value)))
  }
  return map
}

export function currentYear(): number {
  return new Date().getUTCFullYear()
}

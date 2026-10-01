import { createRateLimiter, fetchJsonCached, fetchJsonOrNull, pMap, WEEK_MS } from '../shared/fetchUtil'
import { coveredAfter, currentYear, teamAliases, type LeagueRosters, type RosterEntry } from './common'

const FIRST_SEASON = 1979 // the 1979 WHA merger
const rateLimit = createRateLimiter(120)

interface NhlTeam {
  id: number
  franchiseId: number | null
  triCode: string
  fullName: string
}
interface NhlPlayer {
  id: number
  firstName: { default: string }
  lastName: { default: string }
}

/**
 * Season rosters from the NHL's public API. Teams are keyed by the NHL's own
 * franchise id, so relocations stay one team (Nordiques -> Avalanche,
 * Thrashers -> Jets), with the old names kept as aliases.
 */
export async function nhlRosters(): Promise<LeagueRosters> {
  const { data } = await fetchJsonCached<{ data: NhlTeam[] }>('https://api.nhle.com/stats/rest/en/team', { maxAgeMs: 4 * WEEK_MS })
  // A few tricodes appear twice for a renamed team (Utah Hockey Club / Utah Mammoth); the higher id is the newer name.
  const byTriCode = new Map<string, NhlTeam[]>()
  for (const t of data) if (t.franchiseId) byTriCode.set(t.triCode, [...(byTriCode.get(t.triCode) ?? []), t])
  const firstSeasonId = FIRST_SEASON * 10000 + FIRST_SEASON + 1

  const perTeam = await pMap([...byTriCode.values()], 4, async (versions) => {
    const team = [...versions].sort((a, b) => b.id - a.id)[0]
    const names = versions.map((v) => v.fullName)
    await rateLimit()
    const seasons = await fetchJsonOrNull<number[]>(`https://api-web.nhle.com/v1/roster-season/${team.triCode}`, { maxAgeMs: WEEK_MS })
    const out: RosterEntry[] = []
    for (const seasonId of (seasons ?? []).filter((s) => s >= firstSeasonId)) {
      const season = Math.floor(seasonId / 10000)
      await rateLimit()
      const roster = await fetchJsonOrNull<Record<string, NhlPlayer[]>>(
        `https://api-web.nhle.com/v1/roster/${team.triCode}/${seasonId}`,
        { maxAgeMs: season >= currentYear() - 1 ? WEEK_MS : undefined },
      )
      for (const group of ['forwards', 'defensemen', 'goalies']) {
        for (const p of roster?.[group] ?? []) {
          out.push({
            season,
            teamKey: String(team.franchiseId),
            teamName: team.fullName,
            teamAliases: teamAliases(team.fullName, team.triCode, ...names),
            playerId: String(p.id),
            playerName: `${p.firstName.default} ${p.lastName.default}`,
          })
        }
      }
    }
    return out
  })

  const entries = perTeam.flat()
  console.log(`  NHL: ${entries.length} player-team seasons since ${FIRST_SEASON}`)
  return { entries, careerCovered: coveredAfter(entries, FIRST_SEASON) }
}

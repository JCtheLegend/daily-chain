import { createRateLimiter, fetchJsonCached, fetchJsonOrNull, pMap, WEEK_MS } from '../shared/fetchUtil'
import { currentYear, FIRST_SEASON, teamAliases, type RosterEntry } from './common'

const rateLimit = createRateLimiter(120)

interface NhlPlayer {
  id: number
  firstName: { default: string }
  lastName: { default: string }
}

/** Season rosters from the NHL's public API. Seasons are ids like 20092010. */
export async function nhlRosters(): Promise<RosterEntry[]> {
  const { data: teams } = await fetchJsonCached<{ data: { triCode: string; fullName: string }[] }>(
    'https://api.nhle.com/stats/rest/en/team',
    { maxAgeMs: 4 * WEEK_MS },
  )
  const firstSeasonId = FIRST_SEASON * 10000 + FIRST_SEASON + 1

  const perTeam = await pMap(teams, 4, async (team) => {
    await rateLimit()
    const seasons = await fetchJsonOrNull<number[]>(`https://api-web.nhle.com/v1/roster-season/${team.triCode}`, { maxAgeMs: WEEK_MS })
    const recent = (seasons ?? []).filter((s) => s >= firstSeasonId)
    const out: RosterEntry[] = []
    for (const seasonId of recent) {
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
            teamKey: team.triCode,
            teamName: team.fullName,
            teamAliases: teamAliases(team.fullName, team.triCode),
            playerId: String(p.id),
            playerName: `${p.firstName.default} ${p.lastName.default}`,
          })
        }
      }
    }
    return out
  })

  const entries = perTeam.flat()
  const bySeason = new Map<number, number>()
  for (const e of entries) bySeason.set(e.season, (bySeason.get(e.season) ?? 0) + 1)
  for (const [season, n] of [...bySeason].sort((a, b) => a[0] - b[0])) console.log(`  NHL ${season}: ${n} player-team seasons`)
  return entries
}

import { createRateLimiter, fetchJsonCached, pMap, WEEK_MS } from '../shared/fetchUtil'
import { coveredAfter, currentYear, teamAliases, type LeagueRosters, type RosterEntry } from './common'

const API = 'https://statsapi.mlb.com/api/v1'
const FIRST_SEASON = 1975
const rateLimit = createRateLimiter(100)

interface MlbTeam {
  id: number
  name: string
  teamName: string
  abbreviation: string
}

/**
 * Everyone on a club's roster at any point in a season (MLB Stats API
 * "fullSeason" roster). Team ids stay the same through moves (Expos ->
 * Nationals), so they double as franchise keys.
 */
export async function mlbRosters(): Promise<LeagueRosters> {
  const entries: RosterEntry[] = []
  for (let season = FIRST_SEASON; season <= currentYear(); season++) {
    const maxAgeMs = season >= currentYear() ? WEEK_MS : undefined
    await rateLimit()
    const { teams } = await fetchJsonCached<{ teams: MlbTeam[] }>(`${API}/teams?sportId=1&season=${season}`, { maxAgeMs })
    if (!teams?.length) break

    const rosters = await pMap(teams, 4, async (team) => {
      await rateLimit()
      const data = await fetchJsonCached<{ roster?: { person: { id: number; fullName: string } }[] }>(
        `${API}/teams/${team.id}/roster?rosterType=fullSeason&season=${season}`,
        { maxAgeMs },
      )
      return { team, roster: data.roster ?? [] }
    })

    for (const { team, roster } of rosters) {
      for (const { person } of roster) {
        entries.push({
          season,
          teamKey: String(team.id),
          teamName: team.name,
          teamAliases: teamAliases(team.name, team.teamName, team.abbreviation),
          playerId: String(person.id),
          playerName: person.fullName,
        })
      }
    }
  }
  console.log(`  MLB: ${entries.length} player-team seasons since ${FIRST_SEASON}`)
  return { entries, careerCovered: coveredAfter(entries, FIRST_SEASON) }
}

import { createRateLimiter, fetchJsonCached, pMap, WEEK_MS } from '../shared/fetchUtil'
import { currentYear, FIRST_SEASON, teamAliases, type RosterEntry } from './common'

const API = 'https://statsapi.mlb.com/api/v1'
const rateLimit = createRateLimiter(100)

interface MlbTeam {
  id: number
  name: string
  teamName: string
  abbreviation: string
}

/** Everyone on a club's roster at any point in a season (MLB Stats API "fullSeason" roster). */
export async function mlbRosters(): Promise<RosterEntry[]> {
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

    let count = 0
    for (const { team, roster } of rosters) {
      for (const { person } of roster) {
        count++
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
    console.log(`  MLB ${season}: ${count} player-team seasons`)
  }
  return entries
}

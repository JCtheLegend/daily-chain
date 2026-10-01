import { parseCsv } from '../shared/csv'
import { fetchBytesCached, WEEK_MS } from '../shared/fetchUtil'
import { coveredAfter, teamAliases, type LeagueRosters, type RosterEntry } from './common'

// Basketball-Reference season data, republished as open CSVs.
const DATA = 'https://raw.githubusercontent.com/sumitrodatta/bball-reference-datasets/master/Data'
const FIRST_SEASON = 1949 // 1949–50, the NBA's first season under that name

/** Older abbreviations folded into today's franchise (Seattle SuperSonics -> Thunder, etc.). */
const FRANCHISE: Record<string, string> = {
  MNL: 'LAL', PHW: 'GSW', SFW: 'GSW', SYR: 'PHI', ROC: 'SAC', CIN: 'SAC', KCO: 'SAC', KCK: 'SAC', FTW: 'DET',
  MLH: 'ATL', STL: 'ATL', SDR: 'HOU', CHP: 'WAS', CHZ: 'WAS', BAL: 'WAS', CAP: 'WAS', WSB: 'WAS', BUF: 'LAC',
  SDC: 'LAC', NOJ: 'UTA', NYN: 'BRK', NJN: 'BRK', VAN: 'MEM', SEA: 'OKC', CHH: 'CHO', CHA: 'CHO', NOH: 'NOP', NOK: 'NOP',
}

async function csv(file: string) {
  const bytes = await fetchBytesCached(`${DATA}/${encodeURIComponent(file)}`, { maxAgeMs: WEEK_MS })
  return parseCsv(bytes!.toString('utf-8'))
}

/** Every NBA player-team season since 1949–50. Player ids are Basketball-Reference ids. */
export async function nbaRosters(): Promise<LeagueRosters> {
  const teamNames = new Map<string, string>() // "season|abbr" -> name that season
  for (const r of await csv('Team Abbrev.csv')) if (r.lg === 'NBA') teamNames.set(`${r.season}|${r.abbreviation}`, r.team)

  const entries: RosterEntry[] = []
  const seen = new Set<string>()
  for (const r of await csv('Player Season Info.csv')) {
    // Basketball-Reference labels a season by the year it ends.
    const season = Number(r.season) - 1
    const name = teamNames.get(`${r.season}|${r.team}`)
    if (r.lg !== 'NBA' || season < FIRST_SEASON || !name) continue // also skips "2TM"/"TOT" summary rows
    const key = `${season}|${r.team}|${r.player_id}`
    if (seen.has(key)) continue
    seen.add(key)
    entries.push({
      season,
      teamKey: FRANCHISE[r.team] ?? r.team,
      teamName: name,
      teamAliases: teamAliases(name, r.team),
      playerId: r.player_id,
      playerName: r.player,
    })
  }
  console.log(`  NBA: ${entries.length} player-team seasons since ${FIRST_SEASON}`)
  return { entries, careerCovered: coveredAfter(entries, FIRST_SEASON) }
}

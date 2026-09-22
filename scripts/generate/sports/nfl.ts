import { parseCsv } from '../shared/csv'
import { fetchBytesCached, WEEK_MS } from '../shared/fetchUtil'
import { currentYear, FIRST_SEASON, teamAliases, type RosterEntry } from './common'

// nflverse season rosters (open data, one file per season).
const url = (season: number) => `https://github.com/nflverse/nflverse-data/releases/download/rosters/roster_${season}.csv`

/** nflverse has used a few different codes for the same franchise over the years. */
const CODE_ALIASES: Record<string, string> = { ARZ: 'ARI', BLT: 'BAL', CLV: 'CLE', HST: 'HOU', JAC: 'JAX', SL: 'STL', LAR: 'LA' }

function teamName(code: string, season: number): string | null {
  switch (code) {
    case 'ARI': return 'Arizona Cardinals'
    case 'ATL': return 'Atlanta Falcons'
    case 'BAL': return 'Baltimore Ravens'
    case 'BUF': return 'Buffalo Bills'
    case 'CAR': return 'Carolina Panthers'
    case 'CHI': return 'Chicago Bears'
    case 'CIN': return 'Cincinnati Bengals'
    case 'CLE': return 'Cleveland Browns'
    case 'DAL': return 'Dallas Cowboys'
    case 'DEN': return 'Denver Broncos'
    case 'DET': return 'Detroit Lions'
    case 'GB': return 'Green Bay Packers'
    case 'HOU': return 'Houston Texans'
    case 'IND': return 'Indianapolis Colts'
    case 'JAX': return 'Jacksonville Jaguars'
    case 'KC': return 'Kansas City Chiefs'
    case 'LA': return 'Los Angeles Rams'
    case 'STL': return 'St. Louis Rams'
    case 'LAC': return 'Los Angeles Chargers'
    case 'SD': return 'San Diego Chargers'
    case 'LV': return 'Las Vegas Raiders'
    case 'OAK': return 'Oakland Raiders'
    case 'MIA': return 'Miami Dolphins'
    case 'MIN': return 'Minnesota Vikings'
    case 'NE': return 'New England Patriots'
    case 'NO': return 'New Orleans Saints'
    case 'NYG': return 'New York Giants'
    case 'NYJ': return 'New York Jets'
    case 'PHI': return 'Philadelphia Eagles'
    case 'PIT': return 'Pittsburgh Steelers'
    case 'SEA': return 'Seattle Seahawks'
    case 'SF': return 'San Francisco 49ers'
    case 'TB': return 'Tampa Bay Buccaneers'
    case 'TEN': return 'Tennessee Titans'
    case 'WAS':
      if (season <= 2019) return 'Washington Redskins'
      if (season <= 2021) return 'Washington Football Team'
      return 'Washington Commanders'
    default: return null
  }
}

/**
 * Everyone on an NFL roster during a season (active, injured reserve, etc. —
 * practice squad excluded). Player ids are nflverse gsis ids; `pfr` maps them
 * to Pro-Football-Reference ids for the fame lookup.
 */
export async function nflRosters(): Promise<{ entries: RosterEntry[]; pfrIds: Map<string, string> }> {
  const entries: RosterEntry[] = []
  const pfrIds = new Map<string, string>()
  const unknownCodes = new Set<string>()

  for (let season = FIRST_SEASON; season <= currentYear(); season++) {
    const bytes = await fetchBytesCached(url(season), { allow404: true, maxAgeMs: season >= currentYear() - 1 ? WEEK_MS : undefined })
    if (!bytes) break
    const seen = new Set<string>()
    for (const r of parseCsv(bytes.toString('utf-8'))) {
      if (r.status === 'DEV' || !r.team || !r.full_name) continue
      const code = CODE_ALIASES[r.team] ?? r.team
      const name = teamName(code, season)
      if (!name) {
        unknownCodes.add(r.team)
        continue
      }
      const playerId = r.gsis_id || `${r.full_name}|${r.birth_date}`
      const key = `${code}|${playerId}`
      if (seen.has(key)) continue
      seen.add(key)
      if (r.pfr_id) pfrIds.set(playerId, r.pfr_id)
      entries.push({
        season,
        teamKey: code,
        teamName: name,
        teamAliases: teamAliases(name, code, code === 'WAS' ? 'Washington' : undefined),
        playerId,
        playerName: r.full_name,
      })
    }
    console.log(`  NFL ${season}: ${seen.size} player-team seasons`)
  }
  if (unknownCodes.size) console.warn(`  NFL: skipped unknown team codes ${[...unknownCodes].join(', ')}`)
  return { entries, pfrIds }
}

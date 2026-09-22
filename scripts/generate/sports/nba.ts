import { parquetReadObjects } from 'hyparquet'
import { compressors } from 'hyparquet-compressors'
import { fetchBytesCached, fetchJsonCached, WEEK_MS } from '../shared/fetchUtil'
import { currentYear, FIRST_SEASON, teamAliases, type RosterEntry } from './common'

// ESPN box scores republished as open data by sportsdataverse (2002 season onward).
const RELEASE = 'https://api.github.com/repos/sportsdataverse/sportsdataverse-data/releases/tags/espn_nba_player_boxscores'

interface BoxRow {
  season: number
  season_type: number
  team_id: number
  team_display_name: string
  team_name: string
  team_abbreviation: string
  athlete_id: number
  athlete_display_name: string
  did_not_play: boolean | null
}

/** Every player who appeared in a regular-season or playoff game for a team, by season. ESPN ids. */
export async function nbaRosters(): Promise<RosterEntry[]> {
  const release = await fetchJsonCached<{ assets: { name: string; browser_download_url: string }[] }>(RELEASE, {
    maxAgeMs: WEEK_MS,
  })
  const files = release.assets
    .map((a) => ({ year: Number(a.name.match(/^player_box_(\d{4})\.parquet$/)?.[1]), url: a.browser_download_url }))
    .filter((f) => f.year && f.year - 1 >= FIRST_SEASON)
    .sort((a, b) => a.year - b.year)

  const entries: RosterEntry[] = []
  for (const file of files) {
    const bytes = await fetchBytesCached(file.url, { maxAgeMs: file.year >= currentYear() ? WEEK_MS : undefined })
    if (!bytes) continue
    const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
    const rows = (await parquetReadObjects({
      file: ab,
      compressors,
      columns: ['season', 'season_type', 'team_id', 'team_display_name', 'team_name', 'team_abbreviation', 'athlete_id', 'athlete_display_name', 'did_not_play'],
    })) as BoxRow[]

    const seen = new Set<string>()
    for (const r of rows) {
      // Regular season and playoffs only; ids above 30 are All-Star/exhibition squads.
      if ((r.season_type !== 2 && r.season_type !== 3) || Number(r.team_id) > 30 || r.did_not_play) continue
      const key = `${r.team_id}|${r.athlete_id}`
      if (seen.has(key)) continue
      seen.add(key)
      entries.push({
        season: Number(r.season) - 1, // ESPN labels a season by the year it ends
        teamKey: String(r.team_id),
        teamName: r.team_display_name,
        teamAliases: teamAliases(r.team_display_name, r.team_name, r.team_abbreviation),
        playerId: String(r.athlete_id),
        playerName: r.athlete_display_name,
      })
    }
    console.log(`  NBA ${file.year - 1}: ${seen.size} player-team seasons`)
  }
  return entries
}

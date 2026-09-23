import { fetchJsonCached, WEEK_MS } from './shared/fetchUtil'

// Every Billboard Hot 100 chart since 1958, kept up to date by
// github.com/mhollingshead/billboard-hot-100. Used only as a filter for which
// songs count as "popular in the US".
const ALL_CHARTS = 'https://raw.githubusercontent.com/mhollingshead/billboard-hot-100/main/all.json'

interface Chart {
  date: string
  data: { song: string; artist: string }[]
}

/** Lowercase words only: "Beyoncé" -> "beyonce", "JAY-Z" -> "jay z", "Tame Impala & JENNIE" -> "tame impala and jennie". */
export function words(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Title key ignoring bracketed extras: "Bad Habits (MEDUZA Remix)" and "Bad Habits" share one. */
function titleKey(title: string): string {
  return words(title.replace(/\s*[([][^)\]]*[)\]]/g, ''))
}

export interface Hot100 {
  /**
   * The charting version of a song, if one matches: Billboard's title and the
   * given artists who are actually in Billboard's credit. Remixers and other
   * extras Deezer lists but Billboard doesn't are dropped.
   */
  match<T extends { name: string }>(title: string, artists: T[]): { title: string; credited: T[] } | null
}

export async function loadHot100(): Promise<Hot100> {
  const charts = await fetchJsonCached<Chart[]>(ALL_CHARTS, { maxAgeMs: WEEK_MS })
  const byTitle = new Map<string, Map<string, string>>() // title key -> artist credit (as words) -> Billboard title
  for (const chart of charts) {
    for (const entry of chart.data) {
      const key = titleKey(entry.song)
      if (!byTitle.has(key)) byTitle.set(key, new Map())
      const credits = byTitle.get(key)!
      const credit = ` ${words(entry.artist)} `
      if (!credits.has(credit)) credits.set(credit, entry.song)
    }
  }
  console.log(`Billboard Hot 100: ${charts.length} weekly charts, ${byTitle.size} distinct song titles`)

  return {
    match(title, artists) {
      const credits = byTitle.get(titleKey(title))
      if (!credits) return null
      let best: { title: string; credited: typeof artists } | null = null
      for (const [credit, chartTitle] of credits) {
        const credited = artists.filter((a) => {
          const name = words(a.name)
          return name.length > 0 && credit.includes(` ${name} `)
        })
        if (credited.length && (!best || credited.length > best.credited.length)) best = { title: chartTitle, credited }
      }
      return best
    },
  }
}

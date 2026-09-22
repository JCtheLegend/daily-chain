/**
 * Runs all three category generators in sequence. Each one independently
 * no-ops (or requires its own API key) so a partial run never breaks the
 * others.
 * Usage: tsx scripts/generate/index.ts [--count=30] [--start-date=2026-01-01] [--only=actors-movies,athletes-teams]
 */
import { main as generateActorsMovies } from './actorsMovies'
import { main as generateArtistsSongs } from './artistsSongs'
import { main as generateAthletesTeams } from './athletesTeams'

const only = process.argv.find((a) => a.startsWith('--only='))?.split('=')[1]?.split(',')

async function main() {
  const steps: { id: string; label: string; run: () => Promise<void> }[] = [
    { id: 'actors-movies', label: 'Actors & Movies (TMDb)', run: generateActorsMovies },
    { id: 'artists-songs', label: 'Artists & Songs (Deezer)', run: generateArtistsSongs },
    { id: 'athletes-teams', label: 'Athletes & Teams (NBA/NFL/MLB/NHL rosters)', run: generateAthletesTeams },
  ]

  for (const step of steps) {
    if (only && !only.includes(step.id)) continue
    console.log(`\n=== ${step.label} ===`)
    await step.run()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

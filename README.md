# Chainly

A daily browser puzzle game, mobile-friendly, in the Wordle/Connections family.
You're given two people from the same world — two actors, two musicians, two
NBA players — and you have to connect them by building a real chain of
movies/songs/teams and the people on them, one guess at a time.

Three daily games:

- **Actors & Movies** — connect two actors through movies they were cast in (data from [TMDb](https://www.themoviedb.org/)).
- **Artists & Songs** — connect two musicians through songs they were credited/featured on together (data from [MusicBrainz](https://musicbrainz.org/)).
- **Athletes & Teams** — connect two NBA players through teams they were *actually teammates on at the same time* (data from [Wikidata](https://www.wikidata.org/), using dated `member of sports team` statements so the "same time" constraint is real, not just "played for the same franchise 20 years apart").

## How the game works

Each puzzle bundles a small real-world graph: person nodes and "work" nodes
(movie/song/team-season), with edges wherever a person actually appears on
that work. You start at one person and must reach the other by typing, in
turn, a work connected to your current person, then a person connected to
that work, and so on. Guesses are matched against the *actual* neighbors of
your current position (exact name, alias, or a close fuzzy match) — a real
name that isn't actually reachable from where you are is still wrong, same
as a Six-Degrees-of-Kevin-Bacon puzzle.

There's no backend: puzzles are static JSON files generated ahead of time
and the whole site is a static bundle, deployable to GitHub Pages for free.

## Local development

Requires Node `^20.19.0` or `>=22.12.0` (this repo pins `22.23.2` via
`.nvmrc` — the Vite 8/rolldown native binding silently fails to install on
older patch versions, which shows up as a `vite build` crash, not a clear
error).

```bash
nvm use   # if you use nvm
npm install
npm run dev
```

## Generating puzzles

Puzzle JSON lives in `public/puzzles/<category>/<date>.json`, plus an
`index.json` per category listing available dates. `src/pages/GamePage.tsx`
falls back to the most recent available date if today's isn't published yet,
so the site never hard-errors on a missing day.

```bash
cp .env.example .env   # then fill in TMDB_API_KEY
npm run generate                    # all three categories
npm run generate:actors             # Actors & Movies only (needs TMDB_API_KEY)
npm run generate:artists            # Artists & Songs only (no key needed)
npm run generate:athletes           # Athletes & Teams only (no key needed)
```

Flags: `--count=30` (days to generate), `--start-date=2026-01-01` (defaults
to the day after the latest already-published puzzle, so re-running is
additive and never rewrites a puzzle that might already be live).

**Actors & Movies needs a free TMDb API key** — sign up at
<https://www.themoviedb.org/settings/api> (a couple minutes, no cost) and
set `TMDB_API_KEY`. Without it, that generator logs a message and skips
itself; the other two categories don't need any key.

Generated API responses are cached on disk under `scripts/generate/.cache`
(gitignored) so re-running generation doesn't hammer these free APIs or
redo work.

### Puzzle quality notes

- Puzzle endpoints (the two people you're actually asked to connect) are
  restricted to a notable subset — TMDb's popular-people list, a curated
  seed list of high-profile recording artists, or NBA players with enough
  Wikipedia sitelinks — so you're never asked to identify someone obscure.
  Intermediate connectors in the chain can be less famous, same as any
  Bacon-number puzzle.
- Athletes & Teams currently covers the NBA only (`LEAGUE_QID` in
  `scripts/generate/athletesTeams.ts`); the Wikidata query generalizes to
  other leagues by swapping that QID, but it's untested beyond the NBA.

## Deploying

This repo deploys to GitHub Pages via `.github/workflows/deploy.yml` on
every push to `main`. One-time setup after you push this repo to GitHub:

1. Repo Settings → Pages → Source → **GitHub Actions**.
2. (Optional, for Actors & Movies) Settings → Secrets and variables →
   Actions → add `TMDB_API_KEY`.
3. Push to `main` — the site builds and deploys automatically.

`.github/workflows/generate-puzzles.yml` runs weekly (and via manual
dispatch) to extend the puzzle calendar and commit the new JSON files,
which in turn triggers a redeploy.

## Architecture

- `src/engine/` — category-agnostic game logic: puzzle loading, chain
  validation/fuzzy matching, daily puzzle numbering, localStorage
  persistence, share-text formatting.
- `src/categories/config.ts` — the only per-category *display* config
  (labels, prompts, emoji). Adding a fourth category to the UI is mostly
  adding an entry here plus a puzzle data source.
- `src/components/`, `src/pages/` — UI.
- `scripts/generate/shared/` — generic bipartite-graph crawler, BFS
  shortest-path/puzzle-pair picker, and the puzzle JSON writer, shared by
  all three category-specific generators.
- `scripts/generate/{actorsMovies,artistsSongs,athletesTeams}.ts` — one
  data pipeline per category, each hitting a different free API.

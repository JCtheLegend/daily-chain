# Daily Chain

A daily browser puzzle game, built for phones, in the Wordle/Connections
family. You get two people and forge a chain between them, one real link at a
time. Play it at <https://jcthelegend.github.io/daily-chain/>.

Three daily games:

- **Actors & Movies**: actors linked through movies they were cast in. Data from [TMDb](https://www.themoviedb.org/).
- **Artists & Songs**: artists linked through songs they're both credited on. Data from [Deezer](https://developers.deezer.com/).
- **Athletes & Teams**: players linked through teams they were on **in the same season**. The league rotates daily between the NBA, NFL, MLB and NHL.

## How the game works

Each puzzle bundles a slice of a real-world graph. People connect to "works"
(a movie, a song, or a *team-season* such as "Lakers 2009–10") wherever they
really appear on them. You start at one person and type a work connected to
them, then another person on that work, and so on until you reach the target.

Every guess is checked against the real neighbors of your current position
(exact name, alias like "Lakers" or "LAL", or a close fuzzy match):

- 🟩 **Correct**: a real link that still has a route to the target.
- 🟨 **Real, but no progress**: a true answer that doesn't move you forward.
  It may be one of these:
  - a dead end within today's puzzle
  - a real credit or roster spot that isn't part of today's graph
  - a loop, like naming A.J. Hawk from the 2012 Packers when his only way on
    is straight back to the Packers and another player from that season would
    get there sooner

  The chain doesn't advance.
- ⬛ **Wrong**: not a link we know of.

For sports, naming a team stands for every season the current player spent
there. Naming the next player narrows it to the seasons the two actually
shared, so "at the same time" is enforced.

If a player doubles back through a same-named link anyway (A → Team → B → Team
→ C), the chain drops B when C also overlapped with A. When C didn't overlap
with A, B stays as the bridge, because merging would claim a false teammate.
Naming the link you just came from steps back to it.

The share text is the result line plus a tally, e.g. `🟩×6 🟨×1 ⬛×1`.

Players can **undo** the last link or **erase** the chain to try another route.
A **hint** shows the next link masked ("T__ H____"), then in full. When going
back and choosing differently gives a shorter chain, the hint says to swap the
last choice instead, with a button that rewinds for you. **Reveal** gives up
and shows a shortest chain. After solving, the result panel shows
your chain length next to the shortest chain possible that day.

There's no backend. Puzzles are static JSON files generated ahead of time, and
the whole site is a static bundle on GitHub Pages.

## Local development

Requires Node `^20.19.0` or `>=22.12.0`. This repo pins `22.23.2` in `.nvmrc`.
On older patch versions the Vite 8/rolldown native binding silently fails to
install, which shows up as a `vite build` crash rather than a clear error.

```bash
nvm use
npm install
npm run dev
```

## Generating puzzles

Puzzle JSON lives in `public/puzzles/<category>/<date>.json`, with an
`index.json` per category listing the available dates.

```bash
cp .env.example .env   # then fill in TMDB_API_KEY
npm run generate            # all three categories
npm run generate:actors     # needs TMDB_API_KEY
npm run generate:artists    # no key needed
npm run generate:athletes   # no key needed
npm run validate            # check every published puzzle
```

Flags:

- `--count=30`: how many days to generate.
- `--start-date=2026-01-01`: defaults to the day after the latest published
  puzzle, so re-running only adds days and never rewrites a live puzzle.

API responses are cached under `scripts/generate/.cache` (gitignored).

### Data sources

| Category | Graph | Who can be a start/end |
|---|---|---|
| Actors & Movies | TMDb credits; documentaries and cameos as themselves excluded | Top-billed stars of TMDb's 300 most-voted movies |
| Artists & Songs | Deezer top tracks and their credited contributors, seeded from ~110 well-known artists and their frequent collaborators | The seed artists |
| NBA | ESPN box scores via [sportsdataverse](https://github.com/sportsdataverse/sportsdataverse-data), 2001–02 on (players who actually appeared in a game) | Most-linked players on Wikipedia/Wikidata |
| NFL | [nflverse](https://github.com/nflverse/nflverse-data) season rosters, 2000 on (practice squad excluded) | Same |
| MLB | MLB Stats API full-season rosters, 2000 on | Same |
| NHL | NHL API season rosters, 2000–01 on | Same |

Fame for athletes is the number of Wikipedia/Wikimedia sitelinks on the
player's Wikidata item. It's looked up through each league's player-ID property
(for example P3541, MLB.com player ID) on the
[QLever](https://qlever.cs.uni-freiburg.de/) SPARQL endpoint.

"Same season" is the granularity for sports. A player traded mid-season appears
on both teams that season, which is the usual definition of teammates.

### Validation

`npm run validate` checks every puzzle:

- structure: bipartite edges, endpoints exist, and the stored par matches the
  real shortest chain
- solvability: it replays the shortest solution through the game engine,
  typing each name exactly as a player would, and the puzzle fails if the game
  doesn't accept it

Both the deploy and the weekly generation workflows run it, so a broken puzzle
can't ship.

## Deploying

`.github/workflows/deploy.yml` validates, builds and deploys to GitHub Pages on
every push to `main`. `.github/workflows/generate-puzzles.yml` runs weekly (or
by manual dispatch) to extend the calendar, then commits the new puzzles, which
triggers a redeploy. It needs the `TMDB_API_KEY` repo secret.

## Architecture

- `src/engine/`: category-agnostic game logic. Covers matching, dead-end
  detection, hints, undo, the solution path, daily numbering, persistence and
  share text.
- `src/categories/config.ts`: per-category labels and prompts.
- `src/components/`, `src/pages/`: UI, including the dungeon theme in `src/index.css`.
- `scripts/generate/shared/`: graph utilities, the puzzle slicer (it also
  computes the "real but not today" names), the date-series loop, and the writer.
- `scripts/generate/{actorsMovies,artistsSongs,athletesTeams}.ts` plus
  `scripts/generate/sports/`: one data pipeline per category or league.
- `scripts/validate.ts`: the puzzle validator.

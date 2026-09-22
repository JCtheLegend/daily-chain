import type { Puzzle } from './types'
import { linkCount, type ChainState } from './chainEngine'
import { CATEGORY_META } from '../categories/config'

const SQUARE = { correct: '🟩', 'dead-end': '🟨', 'off-graph': '🟨', wrong: '⬛' } as const

export function buildShareText(puzzle: Puzzle, state: ChainState, siteUrl: string): string {
  const meta = CATEGORY_META[puzzle.category]
  const squares = state.guesses.map((g) => SQUARE[g.outcome]).join('')
  const par = linkCount(puzzle.parMoves + 1)
  const result = state.won
    ? `⛓️ ${linkCount(state.steps.length)} links (shortest ${par})`
    : 'Chain broken — solution revealed'
  const hints = state.hintsUsed > 0 ? ` · 💡${state.hintsUsed}` : ''
  const tag = puzzle.tag ? ` ${puzzle.tag}` : ''

  return [`Daily Chain ${meta.emoji} #${puzzle.number} — ${meta.title}${tag}`, result + hints, squares, siteUrl].join('\n')
}

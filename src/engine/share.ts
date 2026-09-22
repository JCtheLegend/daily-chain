import type { Puzzle } from './types'
import { linkCount, type ChainState, type Outcome } from './chainEngine'
import { CATEGORY_META } from '../categories/config'

const SQUARE: Record<Outcome, string> = { correct: '🟩', 'dead-end': '🟨', loop: '🟨', 'off-graph': '🟨', wrong: '⬛' }

export function buildShareText(puzzle: Puzzle, state: ChainState, siteUrl: string): string {
  const meta = CATEGORY_META[puzzle.category]
  const counts = new Map<string, number>()
  for (const g of state.guesses) counts.set(SQUARE[g.outcome], (counts.get(SQUARE[g.outcome]) ?? 0) + 1)
  const tally = ['🟩', '🟨', '⬛']
    .filter((sq) => counts.get(sq))
    .map((sq) => `${sq}×${counts.get(sq)}`)
    .join(' ')
  const par = linkCount(puzzle.parMoves + 1)
  const result = state.won ? `⛓️ ${linkCount(state.steps.length)} links (shortest ${par})` : 'Chain broken — solution revealed'
  const hints = state.hintsUsed > 0 ? ` · 💡${state.hintsUsed}` : ''
  const tag = puzzle.tag ? ` ${puzzle.tag}` : ''

  return [`Daily Chain ${meta.emoji} #${puzzle.number} — ${meta.title}${tag}`, result + hints, tally, siteUrl]
    .filter(Boolean)
    .join('\n')
}

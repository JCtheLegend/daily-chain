import type { Puzzle } from './types'
import type { ChainState } from './chainEngine'
import { CATEGORY_META } from '../categories/config'

export function buildShareText(puzzle: Puzzle, state: ChainState, siteUrl: string): string {
  const meta = CATEGORY_META[puzzle.category]
  const squares = state.guesses.map((g) => (g.correct ? '🟩' : '⬛')).join('')
  const moves = state.path.length - 1
  const parLine = state.won
    ? moves <= puzzle.parMoves
      ? `Solved in ${moves} (par ${puzzle.parMoves}) 🔥`
      : `Solved in ${moves} (par ${puzzle.parMoves})`
    : 'Unsolved'

  return [`Chainly ${meta.emoji} #${puzzle.number} — ${meta.title}`, parLine, squares, siteUrl].join('\n')
}

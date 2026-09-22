import type { GuessRecord, Outcome } from '../engine/chainEngine'

export const OUTCOME_STYLE: Record<Outcome, { icon: string; className: string }> = {
  correct: { icon: '🟩', className: 'border-moss/40 bg-moss/10 text-moss' },
  'dead-end': { icon: '🟨', className: 'border-ember/40 bg-ember/10 text-ember' },
  loop: { icon: '🟨', className: 'border-ember/40 bg-ember/10 text-ember' },
  'off-graph': { icon: '🟨', className: 'border-ember/40 bg-ember/10 text-ember' },
  wrong: { icon: '⬛', className: 'border-white/10 bg-black/30 text-ash' },
}

export function describeGuess(g: GuessRecord): string {
  switch (g.outcome) {
    case 'correct':
      return g.dropped
        ? `${g.matchedName} — linked to ${g.fromName}, so ${g.dropped} isn't needed`
        : `${g.matchedName} — linked to ${g.fromName}`
    case 'dead-end':
      return `${g.matchedName} is real, but it's a dead end today`
    case 'loop':
      return `${g.matchedName} is real, but only leads back to ${g.fromName} — try someone else there`
    case 'off-graph':
      return `${g.matchedName} is real, but not part of today's chain`
    case 'wrong':
      return `No link between ${g.fromName} and "${g.text}"`
  }
}

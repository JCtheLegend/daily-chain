import type { GuessRecord } from '../engine/chainEngine'
import { OUTCOME_STYLE, describeGuess } from './guessFormat'

export default function GuessHistory({ guesses }: { guesses: GuessRecord[] }) {
  if (guesses.length === 0) return null

  return (
    <details className="w-full" open>
      <summary className="cursor-pointer select-none font-display text-xs uppercase tracking-[0.2em] text-ash">
        Forge log ({guesses.length})
      </summary>
      <ul className="mt-2 flex w-full flex-col gap-1">
        {[...guesses].reverse().map((g, i) => {
          const style = OUTCOME_STYLE[g.outcome]
          return (
            <li
              key={guesses.length - 1 - i}
              className={`flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${style.className}`}
            >
              <span aria-hidden="true">{style.icon}</span>
              <span>{describeGuess(g)}</span>
            </li>
          )
        })}
      </ul>
    </details>
  )
}

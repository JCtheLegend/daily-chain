import type { GuessRecord } from '../engine/chainEngine'

export default function GuessHistory({ guesses }: { guesses: GuessRecord[] }) {
  if (guesses.length === 0) return null

  return (
    <ul className="flex w-full flex-col gap-1">
      {[...guesses].reverse().map((g, i) => (
        <li
          key={guesses.length - 1 - i}
          className={[
            'flex items-center gap-2 rounded-md px-3 py-2 text-sm',
            g.correct
              ? 'bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-300'
              : 'bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-300',
          ].join(' ')}
        >
          <span>{g.correct ? '✅' : '❌'}</span>
          <span>{g.text}</span>
        </li>
      ))}
    </ul>
  )
}

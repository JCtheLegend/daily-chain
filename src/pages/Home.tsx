import { Link } from 'react-router-dom'
import { CATEGORY_META, CATEGORY_ORDER } from '../categories/config'
import { todayDateString } from '../engine/dailyIndex'
import { isSolvedToday } from '../engine/storage'

export default function Home() {
  const today = todayDateString()

  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center px-4 py-10">
      <h1 className="text-3xl font-bold tracking-tight">Chainly</h1>
      <p className="mt-2 text-center text-sm text-neutral-500 dark:text-neutral-400">
        A new daily puzzle: connect two people through the real-world things that link them.
      </p>

      <div className="mt-8 flex w-full flex-col gap-3">
        {CATEGORY_ORDER.map((id) => {
          const meta = CATEGORY_META[id]
          const solved = isSolvedToday(id, today)
          return (
            <Link
              key={id}
              to={`/play/${id}`}
              className="flex items-center gap-4 rounded-xl border border-neutral-200 bg-white p-4 text-left shadow-sm transition hover:border-neutral-300 hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-700"
            >
              <span className="text-3xl">{meta.emoji}</span>
              <span className="flex-1">
                <span className="block font-semibold">{meta.title}</span>
                <span className="block text-sm text-neutral-500 dark:text-neutral-400">{meta.tagline}</span>
              </span>
              {solved && (
                <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-700 dark:bg-green-900 dark:text-green-300">
                  Solved
                </span>
              )}
            </Link>
          )
        })}
      </div>
    </div>
  )
}

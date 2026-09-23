import { Link } from 'react-router-dom'
import { CATEGORY_META, CATEGORY_ORDER } from '../categories/config'
import { todayDateString } from '../engine/dailyIndex'
import { solvedStatus } from '../engine/storage'
import ChainLinks from '../components/ChainLinks'
import Torchlight from '../components/Torchlight'
import { useOpenTutorial } from '../tutorialContext'

export default function Home() {
  const today = todayDateString()
  const openTutorial = useOpenTutorial()

  return (
    <div className="relative mx-auto flex w-full max-w-xl flex-1 flex-col items-center px-4 pb-12">
      <Torchlight />
      <div className="sway pointer-events-none absolute left-3 top-0 hidden sm:block" aria-hidden="true">
        <ChainLinks links={14} />
      </div>
      <div className="sway pointer-events-none absolute right-3 top-0 hidden sm:block" aria-hidden="true" style={{ animationDelay: '-3s' }}>
        <ChainLinks links={10} />
      </div>

      <header className="relative mt-10 flex flex-col items-center">
        <div className="flex items-center gap-4">
          <div className="flame" aria-hidden="true" />
          <h1 className="font-display text-4xl font-extrabold tracking-wide text-bone drop-shadow-[0_2px_0_rgba(0,0,0,0.8)] sm:text-5xl">
            Daily Chain
          </h1>
          <div className="flame" aria-hidden="true" style={{ animationDelay: '-0.4s' }} />
        </div>
        <p className="mt-3 max-w-sm text-center text-ash">
          Two names. One chain between them. Forge it link by link from the real movies, songs and teams they share.
        </p>
      </header>

      <div className="relative mt-8 flex w-full flex-col gap-4">
        {CATEGORY_ORDER.map((id) => {
          const meta = CATEGORY_META[id]
          const status = solvedStatus(id, today)
          return (
            <Link key={id} to={`/play/${id}`} className="plate-iron flex items-center gap-4 !px-6 py-4 text-left transition hover:brightness-110">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-black/60 bg-black/40 text-2xl shadow-inner">
                {meta.emoji}
              </span>
              <span className="flex-1">
                <span className="block font-display text-lg font-bold">{meta.title}</span>
                <span className="block text-sm text-bone/70">{meta.tagline}</span>
              </span>
              {status && (
                <span className={`rounded px-2 py-1 font-display text-[11px] font-bold ${status === 'solved' ? 'bg-moss/20 text-moss' : 'bg-ember/15 text-ember'}`}>
                  {status === 'solved' ? 'Forged' : 'Revealed'}
                </span>
              )}
            </Link>
          )
        })}
      </div>

      <section className="panel relative mt-8 w-full p-5 text-sm">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-base font-bold text-ember">How to play</h2>
          <button onClick={openTutorial} className="btn-iron px-3 py-1 text-xs">
            ▶ Watch the tutorial
          </button>
        </div>
        <ul className="mt-2 flex flex-col gap-1.5 text-bone/85">
          <li>Start at the top name. Name something they were in, then someone else in it, and so on until you reach the bottom name.</li>
          <li>🟩 a real link that still leads somewhere</li>
          <li>🟨 a real link that doesn't move you forward: a dead end, one that only loops back where you came from, or one outside today's puzzle</li>
          <li>⬛ not a link we know of</li>
          <li>Stuck? Undo or erase links to try another route, take a hint, or reveal the solution.</li>
        </ul>
      </section>
    </div>
  )
}

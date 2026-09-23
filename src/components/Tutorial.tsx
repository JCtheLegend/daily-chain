import { Fragment, useEffect, useRef, useState } from 'react'
import type { PuzzleNode } from '../engine/types'
import ChainNode from './ChainNode'
import ChainLinks from './ChainLinks'

// A real 2-link chain between very famous names (DiCaprio and Gosling have
// never shared a film, so it genuinely takes two links).
const START: PuzzleNode = { id: 't-start', name: 'Leonardo DiCaprio', type: 'person' }
const END: PuzzleNode = { id: 't-end', name: 'Ryan Gosling', type: 'person' }
const MIDDLE: PuzzleNode[] = [
  { id: 't-1', name: 'The Wolf of Wall Street', type: 'work', subtitle: '2013' },
  { id: 't-2', name: 'Margot Robbie', type: 'person' },
  { id: 't-3', name: 'Barbie', type: 'work', subtitle: '2023' },
]

const CAPTIONS = [
  'Each puzzle gives you two people. Forge a chain between them.',
  'Name a movie Leonardo DiCaprio was in…',
  '…then someone else in that movie…',
  '…then another movie of hers…',
  '…until you reach Ryan Gosling. Two links, chain forged!',
]
const LAST_STEP = CAPTIONS.length - 1
const STEP_MS = 1300

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

export default function Tutorial({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(() => (prefersReducedMotion() ? LAST_STEP : 0))
  const [run, setRun] = useState(0)
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const timer = setInterval(() => {
      setStep((s) => {
        if (s >= LAST_STEP) clearInterval(timer)
        return Math.min(s + 1, LAST_STEP)
      })
    }, STEP_MS)
    return () => clearInterval(timer)
  }, [run])

  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
    }
  }, [onClose])

  const shown = MIDDLE.slice(0, Math.min(step, MIDDLE.length))
  const complete = step >= LAST_STEP

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="tutorial-title"
        className="panel flex max-h-[92svh] w-full max-w-sm flex-col items-center gap-3 overflow-y-auto p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="tutorial-title" className="font-display text-xl font-bold text-ember">
          How to forge a chain
        </h2>

        <div className="flex w-full flex-col items-center" aria-hidden="true">
          <ChainNode nodes={[START]} lit label="From" />
          {shown.map((node) => (
            <Fragment key={`${run}-${node.id}`}>
              <ChainLinks links={2} />
              <ChainNode nodes={[node]} animate />
            </Fragment>
          ))}
          {complete ? (
            <>
              <ChainLinks links={2} />
              <ChainNode key={`${run}-end`} nodes={[END]} lit animate label="To" />
            </>
          ) : (
            <>
              <ChainLinks links={2} variant="broken" />
              <ChainNode nodes={null} />
              <ChainLinks links={2} variant="broken" />
              <ChainNode nodes={[END]} lit label="To" />
            </>
          )}
        </div>

        <p className="min-h-[3em] text-center text-bone" aria-live="polite">
          {CAPTIONS[step]}
        </p>

        <ul className={`flex w-full flex-col gap-1 text-sm text-bone/85 transition-opacity duration-500 ${complete ? 'opacity-100' : 'opacity-0'}`}>
          <li>🟩 a real link that moves you forward</li>
          <li>🟨 real, but it won't get you there (dead end or loop)</li>
          <li>⬛ not a link</li>
          <li className="text-ash">Stuck? Undo, take a hint, or reveal the answer.</li>
        </ul>

        <div className="flex w-full gap-2">
          <button
            className="btn-iron flex-1 px-3 py-2.5 text-sm"
            onClick={() => {
              setStep(0)
              setRun((r) => r + 1)
            }}
          >
            ↻ Replay
          </button>
          <button ref={closeRef} className="btn-ember flex-[2] px-3 py-2.5 text-sm" onClick={onClose}>
            Let&rsquo;s play
          </button>
        </div>
      </div>
    </div>
  )
}

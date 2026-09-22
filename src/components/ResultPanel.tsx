import { useState } from 'react'
import type { Puzzle } from '../engine/types'
import { linkCount, solutionPath, type ChainState } from '../engine/chainEngine'
import { buildShareText } from '../engine/share'
import { CATEGORY_META } from '../categories/config'

type ShareStatus = 'idle' | 'copied' | 'manual'

export default function ResultPanel({ puzzle, state }: { puzzle: Puzzle; state: ChainState }) {
  const [status, setStatus] = useState<ShareStatus>('idle')
  const [showBest, setShowBest] = useState(false)
  const shortest = linkCount(puzzle.parMoves + 1)
  const mine = linkCount(state.steps.length)
  const text = buildShareText(puzzle, state, window.location.origin + window.location.pathname)
  const best = solutionPath(puzzle)

  async function handleShare() {
    if (navigator.share) {
      try {
        await navigator.share({ text, title: `Daily Chain: ${CATEGORY_META[puzzle.category].title}` })
        return
      } catch {
        // user cancelled the native share sheet, or it's unsupported here — fall through to copy
      }
    }
    try {
      await navigator.clipboard.writeText(text)
      setStatus('copied')
      setTimeout(() => setStatus('idle'), 2000)
    } catch {
      setStatus('manual')
    }
  }

  return (
    <div className="panel flex w-full flex-col items-center gap-3 p-5 text-center">
      <p className="font-display text-xl font-bold text-ember">
        {state.won ? (mine <= shortest ? 'Flawless forging!' : 'The chain holds!') : 'The chain was revealed'}
      </p>

      <div className="grid w-full grid-cols-2 gap-2">
        <Stat label="Your chain" value={state.won ? `${mine} link${mine === 1 ? '' : 's'}` : '—'} />
        <Stat label="Shortest chain today" value={`${shortest} link${shortest === 1 ? '' : 's'}`} />
      </div>
      {state.hintsUsed > 0 && <p className="text-sm text-ash">💡 {state.hintsUsed} hint{state.hintsUsed === 1 ? '' : 's'} used</p>}

      <button onClick={handleShare} className="btn-ember px-5 py-2.5">
        {status === 'copied' ? 'Copied!' : 'Share result'}
      </button>
      {status === 'manual' && (
        <textarea
          readOnly
          value={text}
          onFocus={(e) => e.currentTarget.select()}
          rows={4}
          className="slab-input w-full p-2 text-sm"
        />
      )}

      {state.won && (
        <button onClick={() => setShowBest((v) => !v)} className="text-sm text-ash underline underline-offset-4">
          {showBest ? 'Hide' : 'Show'} a shortest chain
        </button>
      )}
      {showBest && (
        <p className="text-sm leading-relaxed text-bone">
          {best.map((id, i) => (
            <span key={id}>
              {i > 0 && <span className="text-ash"> ⛓ </span>}
              <span className={puzzle.nodes[id].type === 'work' ? 'italic text-ember' : 'font-bold'}>
                {puzzle.nodes[id].name}
              </span>
            </span>
          ))}
        </p>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-black/30 px-2 py-2">
      <div className="text-[10px] uppercase tracking-[0.18em] text-ash">{label}</div>
      <div className="font-display text-lg font-bold">{value}</div>
    </div>
  )
}

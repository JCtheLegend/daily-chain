import { useState } from 'react'
import type { Puzzle } from '../engine/types'
import type { ChainState } from '../engine/chainEngine'
import { buildShareText } from '../engine/share'
import { CATEGORY_META } from '../categories/config'

type ShareStatus = 'idle' | 'copied' | 'manual' | 'error'

export default function ShareResult({ puzzle, state }: { puzzle: Puzzle; state: ChainState }) {
  const [status, setStatus] = useState<ShareStatus>('idle')
  const moves = state.path.length - 1
  const text = buildShareText(puzzle, state, window.location.origin + window.location.pathname)

  async function handleShare() {
    if (navigator.share) {
      try {
        await navigator.share({ text, title: `Chainly ${CATEGORY_META[puzzle.category].title}` })
        return
      } catch {
        // user cancelled the native share sheet, or it's unsupported here — fall through to copy
      }
    }

    try {
      await navigator.clipboard.writeText(text)
      setStatus('copied')
      setTimeout(() => setStatus('idle'), 2000)
      return
    } catch {
      // clipboard blocked (permissions, insecure context, old browser) — show text to copy by hand
      setStatus('manual')
    }
  }

  return (
    <div className="flex w-full flex-col items-center gap-3 rounded-xl border border-neutral-200 bg-white p-5 text-center dark:border-neutral-800 dark:bg-neutral-900">
      <span className="text-2xl">🎉</span>
      <p className="font-semibold">
        Solved in {moves} move{moves === 1 ? '' : 's'} (par {puzzle.parMoves})
      </p>
      <button onClick={handleShare} className="rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white">
        {status === 'copied' ? 'Copied!' : 'Share result'}
      </button>
      {status === 'manual' && (
        <textarea
          readOnly
          value={text}
          onFocus={(e) => e.currentTarget.select()}
          rows={4}
          className="w-full rounded-lg border border-neutral-300 bg-neutral-50 p-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
        />
      )}
    </div>
  )
}

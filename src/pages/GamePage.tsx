import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CATEGORY_META } from '../categories/config'
import type { CategoryId, Puzzle } from '../engine/types'
import {
  eraseChain,
  initialChainState,
  maskName,
  nextHintNode,
  revealSolution,
  solutionPath,
  stepName,
  submitGuess,
  takeHint,
  undo,
  type ChainState,
  type Feedback,
} from '../engine/chainEngine'
import { loadTodaysPuzzle } from '../engine/puzzleLoader'
import { loadSavedState, saveState } from '../engine/storage'
import GameBoard from '../components/GameBoard'
import GuessInput from '../components/GuessInput'
import GuessHistory from '../components/GuessHistory'
import { OUTCOME_STYLE, describeGuess } from '../components/guessFormat'
import ResultPanel from '../components/ResultPanel'
import Torchlight from '../components/Torchlight'

function isCategory(value: string | undefined): value is CategoryId {
  return !!value && value in CATEGORY_META
}

function withArticle(noun: string): string {
  return (/^[aeiou]/i.test(noun) ? 'an ' : 'a ') + noun
}

export default function GamePage() {
  const { category } = useParams<{ category: string }>()

  if (!isCategory(category)) {
    return (
      <Centered>
        <p>No such game in this dungeon.</p>
        <Link to="/" className="text-ember underline">
          Back to the gate
        </Link>
      </Centered>
    )
  }

  // Keyed by category so switching games remounts fresh instead of needing
  // to manually reset state inside an effect.
  return <CategoryGame key={category} category={category} />
}

function CategoryGame({ category }: { category: CategoryId }) {
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null)
  const [state, setState] = useState<ChainState | null>(null)
  const [error, setError] = useState(false)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [confirmReveal, setConfirmReveal] = useState(false)

  useEffect(() => {
    loadTodaysPuzzle(category)
      .then((p) => {
        setPuzzle(p)
        setState(loadSavedState(category, p.date) ?? initialChainState(p))
      })
      .catch((e: Error) => {
        console.error(`Failed to load puzzle for ${category}:`, e)
        setError(true)
      })
  }, [category])

  if (error) {
    return (
      <Centered>
        <p>This game has no puzzle forged yet. Check back soon.</p>
        <Link to="/" className="text-ember underline">
          Back to the gate
        </Link>
      </Centered>
    )
  }

  if (!puzzle || !state) return <Centered>Lighting the torches…</Centered>

  const meta = CATEGORY_META[category]
  const over = state.won || state.revealed
  const current = state.steps[state.steps.length - 1]
  const currentNode = puzzle.nodes[current.ids[0]]
  const previousPerson = state.steps.length >= 2 ? stepName(puzzle, state.steps[state.steps.length - 2]) : ''
  const prompt =
    currentNode.type === 'person'
      ? meta.personToWorkPrompt(currentNode.name)
      : meta.workToPersonPrompt(currentNode.name, previousPerson)
  const hintNode = !over && state.hintLevel > 0 ? nextHintNode(puzzle, state) : null

  function update(next: ChainState) {
    setState(next)
    saveState(category, puzzle!.date, next)
  }

  function handleGuess(text: string) {
    const result = submitGuess(puzzle!, state!, text)
    setFeedback(result.feedback)
    if (result.state !== state) update(result.state)
  }

  return (
    <div className="relative mx-auto flex w-full max-w-md flex-1 flex-col items-center gap-4 px-4 pb-10 pt-5">
      <Torchlight />
      <header className="relative flex w-full items-center justify-between">
        <Link to="/" className="text-sm text-ash hover:text-bone">
          ← Gate
        </Link>
        <span className="font-display text-sm font-bold">
          {meta.emoji} {meta.title}
        </span>
        <span className="flex items-center gap-2 text-sm text-ash">
          {puzzle.tag && (
            <span className="rounded border border-ember/50 px-1.5 py-0.5 font-display text-[11px] font-bold text-ember">
              {puzzle.tag}
            </span>
          )}
          #{puzzle.number}
        </span>
      </header>

      <p className="relative text-center text-sm text-ash">{meta.tagline}</p>

      <div className="relative w-full">
        <GameBoard puzzle={puzzle} steps={state.steps} solution={state.revealed ? solutionPath(puzzle) : undefined} />
      </div>

      {over ? (
        <ResultPanel puzzle={puzzle} state={state} />
      ) : (
        <div className="relative flex w-full flex-col gap-3">
          <p className="text-center font-display text-[15px] font-semibold">{prompt}</p>
          <GuessInput
            placeholder={`Type ${withArticle(currentNode.type === 'person' ? meta.workLabel : meta.personLabel)}…`}
            onSubmit={handleGuess}
          />
          {feedback && <FeedbackLine feedback={feedback} />}

          {hintNode && (
            <div className="panel px-4 py-3 text-center text-sm">
              <span className="text-ash">💡 Next link: </span>
              <span className="font-display font-bold tracking-widest text-ember">
                {state.hintLevel >= 2 ? hintNode.name : maskName(hintNode.name)}
              </span>
              {hintNode.subtitle && <span className="text-ash"> ({hintNode.subtitle})</span>}
            </div>
          )}

          <div className="grid grid-cols-4 gap-2">
            <button className="btn-iron px-1 py-2 text-xs" disabled={state.steps.length <= 1} onClick={() => { update(undo(state)); setFeedback(null) }}>
              ↶ Undo
            </button>
            <button className="btn-iron px-1 py-2 text-xs" disabled={state.steps.length <= 1} onClick={() => { update(eraseChain(state)); setFeedback(null) }}>
              ✕ Erase
            </button>
            <button className="btn-iron px-1 py-2 text-xs" disabled={state.hintLevel >= 2} onClick={() => update(takeHint(state))}>
              💡 {state.hintLevel === 0 ? 'Hint' : 'More'}
            </button>
            {confirmReveal ? (
              <button className="btn-ember px-1 py-2 text-xs" onClick={() => update(revealSolution(state))}>
                Sure?
              </button>
            ) : (
              <button className="btn-iron px-1 py-2 text-xs" onClick={() => setConfirmReveal(true)}>
                👁 Reveal
              </button>
            )}
          </div>
        </div>
      )}

      <div className="relative w-full">
        <GuessHistory guesses={state.guesses} />
      </div>
    </div>
  )
}

function FeedbackLine({ feedback }: { feedback: Feedback }) {
  if (feedback.kind === 'ignored') return null
  if (feedback.kind === 'repeat') {
    return <p className="text-center text-sm text-ash">↩️ {feedback.name} is already in your chain</p>
  }
  const style = OUTCOME_STYLE[feedback.record.outcome]
  return (
    <p className={`rounded-md border px-3 py-2 text-center text-sm ${style.className}`} role="status">
      {style.icon} {describeGuess(feedback.record)}
    </p>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">{children}</div>
}

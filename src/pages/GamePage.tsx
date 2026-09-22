import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CATEGORY_META } from '../categories/config'
import type { CategoryId, Puzzle } from '../engine/types'
import { initialChainState, submitGuess, type ChainState } from '../engine/chainEngine'
import { loadTodaysPuzzle } from '../engine/puzzleLoader'
import { loadSavedState, saveState } from '../engine/storage'
import GameBoard from '../components/GameBoard'
import GuessInput from '../components/GuessInput'
import GuessHistory from '../components/GuessHistory'
import ShareResult from '../components/ShareResult'

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
        <p>Unknown game.</p>
        <Link to="/" className="text-indigo-600 underline">
          Back home
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
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadTodaysPuzzle(category)
      .then((p) => {
        setPuzzle(p)
        setState(loadSavedState(category, p.date) ?? initialChainState(p))
      })
      .catch((e: Error) => {
        console.error(`Failed to load puzzle for ${category}:`, e)
        setError(e.message)
      })
  }, [category])

  if (error) {
    return (
      <Centered>
        <p>This game doesn't have a puzzle published yet — check back soon.</p>
        <Link to="/" className="text-indigo-600 underline">
          Back home
        </Link>
      </Centered>
    )
  }

  if (!puzzle || !state) {
    return <Centered>Loading…</Centered>
  }

  const meta = CATEGORY_META[category]
  const currentNodeId = state.path[state.path.length - 1]
  const currentNode = puzzle.nodes[currentNodeId]
  const prompt = state.won
    ? null
    : currentNode.type === 'person'
      ? meta.personToWorkPrompt(currentNode.name)
      : meta.workToPersonPrompt(currentNode.name)

  function handleGuess(text: string) {
    setState((prev) => {
      if (!prev || !puzzle) return prev
      const next = submitGuess(puzzle, prev, text)
      saveState(category, puzzle.date, next)
      return next
    })
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center gap-4 px-4 py-6">
      <header className="flex w-full items-center justify-between">
        <Link to="/" className="text-sm text-neutral-500 hover:underline">
          ← All games
        </Link>
        <span className="text-sm font-medium text-neutral-500">
          {meta.emoji} #{puzzle.number}
        </span>
      </header>

      <p className="text-center text-sm text-neutral-500 dark:text-neutral-400">{meta.tagline}</p>

      <GameBoard puzzle={puzzle} path={state.path} />

      {state.won ? (
        <ShareResult puzzle={puzzle} state={state} />
      ) : (
        <>
          <p className="text-center text-sm font-medium">{prompt}</p>
          <GuessInput
            placeholder={`Type ${withArticle(currentNode.type === 'person' ? meta.workLabel : meta.personLabel)}…`}
            disabled={state.won}
            onSubmit={handleGuess}
          />
        </>
      )}

      <GuessHistory guesses={state.guesses} />
    </div>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">{children}</div>
}

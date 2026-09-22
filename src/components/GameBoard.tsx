import { Fragment } from 'react'
import type { Puzzle } from '../engine/types'
import type { ChainStep } from '../engine/chainEngine'
import ChainNode from './ChainNode'
import ChainLinks from './ChainLinks'

interface Props {
  puzzle: Puzzle
  steps: ChainStep[]
  /** When set, shows this full path (the revealed solution) instead of the player's chain. */
  solution?: string[]
}

export default function GameBoard({ puzzle, steps, solution }: Props) {
  const chain = solution ? solution.map((id) => [id]) : steps.map((s) => s.ids)
  const complete = chain[chain.length - 1][0] === puzzle.end
  const endNode = puzzle.nodes[puzzle.end]

  return (
    <div className="flex w-full flex-col items-center">
      {chain.map((ids, i) => (
        <Fragment key={`${i}-${ids[0]}`}>
          {i > 0 && <ChainLinks links={3} />}
          <ChainNode
            nodes={ids.map((id) => puzzle.nodes[id])}
            lit={i === 0 || (complete && i === chain.length - 1)}
            animate={i > 0 && i === chain.length - 1 && !solution}
            label={i === 0 ? 'From' : complete && i === chain.length - 1 ? 'To' : undefined}
          />
        </Fragment>
      ))}
      {!complete && (
        <>
          <ChainLinks links={3} variant="broken" />
          <ChainNode nodes={null} />
          <ChainLinks links={3} variant="broken" />
          <ChainNode nodes={[endNode]} lit label="To" />
        </>
      )}
    </div>
  )
}

import type { Puzzle } from '../engine/types'
import ChainNode from './ChainNode'

interface Props {
  puzzle: Puzzle
  path: string[]
}

export default function GameBoard({ puzzle, path }: Props) {
  const endNode = puzzle.nodes[puzzle.end]
  const reachedEnd = path[path.length - 1] === puzzle.end
  const displayIds = reachedEnd ? path : [...path, undefined]

  return (
    <div className="flex w-full flex-col items-center gap-1">
      {displayIds.map((id, i) => (
        <div key={id ?? 'pending'} className="flex w-full flex-col items-center gap-1">
          <ChainNode
            node={id ? puzzle.nodes[id] : null}
            role={i === 0 ? 'start' : reachedEnd && i === displayIds.length - 1 ? 'end' : undefined}
          />
          {i < displayIds.length - 1 && <div className="h-4 w-px bg-neutral-300 dark:bg-neutral-700" />}
        </div>
      ))}
      {!reachedEnd && (
        <>
          <div className="h-4 w-px bg-neutral-300 dark:bg-neutral-700" />
          <ChainNode node={endNode} role="end" />
        </>
      )}
    </div>
  )
}

import type { PuzzleNode } from '../engine/types'

interface Props {
  node: PuzzleNode | null
  role?: 'start' | 'end'
}

export default function ChainNode({ node, role }: Props) {
  if (!node) {
    return (
      <div className="flex w-full items-center justify-center rounded-lg border-2 border-dashed border-neutral-300 px-4 py-3 text-neutral-400 dark:border-neutral-700 dark:text-neutral-600">
        ?
      </div>
    )
  }

  const isPerson = node.type === 'person'
  const emphasize = role === 'start' || role === 'end'

  return (
    <div
      className={[
        'flex w-full flex-col items-center rounded-lg px-4 py-3 text-center',
        isPerson
          ? 'bg-indigo-600 text-white'
          : 'border border-neutral-200 bg-neutral-50 text-neutral-800 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100',
        emphasize ? 'ring-2 ring-offset-2 ring-indigo-400 dark:ring-offset-neutral-950' : '',
      ].join(' ')}
    >
      <span className="font-semibold">{node.name}</span>
      {node.subtitle && <span className="text-xs opacity-80">{node.subtitle}</span>}
    </div>
  )
}

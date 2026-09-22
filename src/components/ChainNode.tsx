import type { PuzzleNode } from '../engine/types'

interface Props {
  nodes: PuzzleNode[] | null
  lit?: boolean
  animate?: boolean
  label?: string
}

/** Subtitle for a step that may stand for several same-name nodes (e.g. seasons). */
function stepSubtitle(nodes: PuzzleNode[]): string | undefined {
  const subs = [...nodes].sort((a, b) => (a.year ?? 0) - (b.year ?? 0)).map((n) => n.subtitle).filter(Boolean)
  if (subs.length <= 1) return subs[0]
  if (subs.length === 2) return `${subs[0]} & ${subs[1]}`
  return `${subs[0]} → ${subs[subs.length - 1]}`
}

export default function ChainNode({ nodes, lit, animate, label }: Props) {
  if (!nodes || nodes.length === 0) {
    return (
      <div className="plate-empty flex w-full items-center justify-center px-4 py-3 font-display text-lg">?</div>
    )
  }

  const node = nodes[0]
  const isPerson = node.type === 'person'
  const subtitle = stepSubtitle(nodes)

  return (
    <div
      className={[
        'flex w-full flex-col items-center px-8 text-center',
        isPerson ? 'plate-iron py-3' : 'plate-parchment py-2.5',
        lit ? 'plate-lit' : '',
        animate ? 'forge-in' : '',
      ].join(' ')}
    >
      {label && <span className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-70">{label}</span>}
      <span className={isPerson ? 'font-display text-[17px] font-bold' : 'text-[16px] font-bold leading-tight'}>
        {node.name}
      </span>
      {subtitle && <span className="text-xs opacity-75">{subtitle}</span>}
    </div>
  )
}

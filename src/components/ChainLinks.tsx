import { useId } from 'react'

interface Props {
  links?: number
  /** "broken" draws a faint chain with a missing link, for the unfinished gap. */
  variant?: 'forged' | 'broken'
  className?: string
}

/** A short vertical run of interlocking iron links. */
export default function ChainLinks({ links = 3, variant = 'forged', className }: Props) {
  const gradId = 'iron' + useId().replace(/[^a-zA-Z0-9]/g, '')
  const pitch = 13
  const height = pitch * links + 8
  const broken = variant === 'broken'

  return (
    <svg
      width="22"
      height={height}
      viewBox={`0 0 22 ${height}`}
      aria-hidden="true"
      className={className}
      style={{ opacity: broken ? 0.35 : 1, overflow: 'visible' }}
    >
      <defs>
        <linearGradient id={gradId} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#2e3136" />
          <stop offset="0.42" stopColor="#c3c7ce" />
          <stop offset="0.6" stopColor="#7d828b" />
          <stop offset="1" stopColor="#25282d" />
        </linearGradient>
      </defs>
      {Array.from({ length: links }, (_, i) => {
        if (broken && i === Math.floor(links / 2)) return null
        const cy = 4 + pitch * i + pitch / 2
        return i % 2 === 0 ? (
          <ellipse
            key={i}
            cx="11"
            cy={cy}
            rx="5.5"
            ry="8.5"
            fill="none"
            stroke={`url(#${gradId})`}
            strokeWidth="3.2"
            strokeDasharray={broken ? '4 3' : undefined}
          />
        ) : (
          <rect key={i} x="9.4" y={cy - 9.5} width="3.2" height="19" rx="1.6" fill={`url(#${gradId})`} />
        )
      })}
    </svg>
  )
}

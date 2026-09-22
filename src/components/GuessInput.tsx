import { useState, type FormEvent } from 'react'

interface Props {
  placeholder: string
  onSubmit: (value: string) => void
}

export default function GuessInput({ placeholder, onSubmit }: Props) {
  const [value, setValue] = useState('')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const trimmed = value.trim()
    if (!trimmed) return
    onSubmit(trimmed)
    setValue('')
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full gap-2">
      <input
        type="text"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="words"
        spellCheck={false}
        enterKeyHint="go"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="slab-input min-w-0 flex-1 px-3 py-3 text-base"
      />
      <button type="submit" disabled={!value.trim()} className="btn-ember px-4 py-3 text-sm">
        Forge
      </button>
    </form>
  )
}

import { useState, type FormEvent } from 'react'

interface Props {
  placeholder: string
  disabled: boolean
  onSubmit: (value: string) => void
}

export default function GuessInput({ placeholder, disabled, onSubmit }: Props) {
  const [value, setValue] = useState('')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const trimmed = value.trim()
    if (!trimmed || disabled) return
    onSubmit(trimmed)
    setValue('')
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full gap-2">
      <input
        type="text"
        inputMode="text"
        autoComplete="off"
        autoCapitalize="words"
        spellCheck={false}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        className="min-w-0 flex-1 rounded-lg border border-neutral-300 bg-white px-3 py-3 text-base outline-none focus:border-indigo-500 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900"
      />
      <button
        type="submit"
        disabled={disabled || !value.trim()}
        className="rounded-lg bg-indigo-600 px-4 py-3 font-medium text-white disabled:opacity-40"
      >
        Guess
      </button>
    </form>
  )
}

import type { CategoryId } from './types'
import type { ChainState } from './chainEngine'

function key(category: CategoryId, date: string): string {
  return `daily-chain:v2:${category}:${date}`
}

export function loadSavedState(category: CategoryId, date: string): ChainState | null {
  try {
    const raw = localStorage.getItem(key(category, date))
    return raw ? (JSON.parse(raw) as ChainState) : null
  } catch {
    return null
  }
}

export function saveState(category: CategoryId, date: string, state: ChainState): void {
  try {
    localStorage.setItem(key(category, date), JSON.stringify(state))
  } catch {
    // localStorage unavailable (private mode, quota) — progress just won't persist
  }
}

export function solvedStatus(category: CategoryId, date: string): 'solved' | 'revealed' | null {
  const state = loadSavedState(category, date)
  if (state?.won) return 'solved'
  if (state?.revealed) return 'revealed'
  return null
}

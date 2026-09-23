import { createContext, useContext } from 'react'

/** Lets any page reopen the how-to-play tutorial. */
export const TutorialContext = createContext<() => void>(() => {})

export function useOpenTutorial(): () => void {
  return useContext(TutorialContext)
}

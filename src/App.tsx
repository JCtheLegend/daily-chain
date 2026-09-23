import { useCallback, useState } from 'react'
import { Route, Routes } from 'react-router-dom'
import Home from './pages/Home'
import GamePage from './pages/GamePage'
import Tutorial from './components/Tutorial'
import { hasSeenTutorial, markTutorialSeen } from './engine/storage'
import { TutorialContext } from './tutorialContext'

export default function App() {
  const [showTutorial, setShowTutorial] = useState(() => !hasSeenTutorial())
  const openTutorial = useCallback(() => setShowTutorial(true), [])
  const closeTutorial = useCallback(() => {
    markTutorialSeen()
    setShowTutorial(false)
  }, [])

  return (
    <TutorialContext.Provider value={openTutorial}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/play/:category" element={<GamePage />} />
      </Routes>
      {showTutorial && <Tutorial onClose={closeTutorial} />}
    </TutorialContext.Provider>
  )
}

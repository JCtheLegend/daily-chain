import { Route, Routes } from 'react-router-dom'
import Home from './pages/Home'
import GamePage from './pages/GamePage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/play/:category" element={<GamePage />} />
    </Routes>
  )
}

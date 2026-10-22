import { Navigate, Route, Routes } from 'react-router-dom'
import LibraryHome from './LibraryHome'
import LibraryPage from './LibraryPage'
import SessionPage, { ProgrammePage } from './SessionPage'
import ProgrammesPage from './ProgrammesPage'
import SearchPage from './SearchPage'
import PlayItRightPage from './PlayItRightPage'
import { LIBRARY_PATH } from '@/lib/library/library'

/* TRAK-264 (Kostas, 22 Oct): the coach's Library, at /coach/trainings (the
   frame's Library tab, TRAK-259). The player's Trainings tab is TrainingsPage. */
export default function CoachLibrary() {
  return (
    <Routes>
      <Route index element={<LibraryHome />} />
      <Route path="search" element={<SearchPage />} />
      <Route path="programmes" element={<ProgrammesPage />} />
      <Route path="play-it-right" element={<PlayItRightPage />} />
      <Route path="session/:id" element={<SessionPage />} />
      <Route path="programme/:id" element={<ProgrammePage />} />
      <Route path=":key" element={<LibraryPage />} />
      <Route path="*" element={<Navigate to={LIBRARY_PATH} replace />} />
    </Routes>
  )
}

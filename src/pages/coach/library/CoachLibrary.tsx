import { useLayoutEffect } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigationType } from 'react-router-dom'
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
  const { pathname } = useLocation()
  const navigation = useNavigationType()
  // A page the coach opens starts at its top, wherever they were on the last one. Back (POP) is left to the
  // browser, which returns them to their place. A filter, a topic or a laptop's open session isn't a new page.
  useLayoutEffect(() => {
    if (navigation !== 'POP') (document.scrollingElement ?? document.documentElement).scrollTo(0, 0)
  }, [pathname]) // eslint-disable-line react-hooks/exhaustive-deps -- only a new page moves to the top

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

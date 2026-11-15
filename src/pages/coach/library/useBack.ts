import { useLocation, useNavigate } from 'react-router-dom'

/** TRAK-264: back to wherever the coach came from, with its topic, filters and place in the list.
 *  A page opened straight from a link has nothing to go back to, so it goes to `fallback`. */
export function useBack(fallback: string) {
  const navigate = useNavigate()
  const { key } = useLocation()
  return () => (key === 'default' ? navigate(fallback) : navigate(-1))
}

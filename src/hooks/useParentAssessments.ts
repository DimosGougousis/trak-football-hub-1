import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useParentChildren } from '@/contexts/ParentChildrenContext'
import { fetchParentAssessment, fetchParentAssessmentPage, type AssessmentTarget } from '@/lib/parent-assessments'

export function useParentAssessments() {
  const { parentId, selectedChild } = useParentChildren()
  const childId = selectedChild?.id
  return useInfiniteQuery({
    queryKey: ['parent', parentId, childId, 'assessment-history'],
    queryFn: ({ signal, pageParam }) => fetchParentAssessmentPage(childId!, pageParam, signal),
    initialPageParam: 0,
    getNextPageParam: (page, _pages, lastPage) => page.hasMore ? lastPage + 1 : undefined,
    enabled: !!parentId && !!childId,
    networkMode: 'always',
    refetchOnWindowFocus: true,
  })
}

export function useParentAssessment(target: AssessmentTarget | null) {
  const { parentId, selectedChild } = useParentChildren()
  const childId = selectedChild?.id
  return useQuery({
    queryKey: ['parent', parentId, childId, 'assessment', target?.kind, target?.id],
    queryFn: ({ signal }) => fetchParentAssessment(childId!, target!, signal),
    enabled: !!parentId && !!childId && !!target,
    networkMode: 'always',
    refetchOnWindowFocus: true,
  })
}

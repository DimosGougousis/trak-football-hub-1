import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import type { Database } from '@/integrations/supabase/types'

/* TRAK-579 (coach–player P02): the player's own tasks from TRAK-578's my_tasks(), and their answers. The database
   decides what a player may see and answer; this only reads it, answers, and orders it for the screen. */

export type MyTask = Database['public']['Functions']['my_tasks']['Returns'][number]

/** The button: the one answer the coach asked for. "seen" is recorded on its own and never has one. */
export const ANSWER: Record<string, string> = { got_it: 'Got it', done: 'Done', ready_for_review: 'Ready for review' }

const key = (userId?: string) => ['my-tasks', userId] as const

export function useMyTasks() {
  const { user } = useAuth()
  return useQuery({
    queryKey: key(user?.id),
    enabled: !!user,
    queryFn: async (): Promise<MyTask[]> => {
      const { data, error } = await supabase.rpc('my_tasks')
      if (error) throw error
      return data ?? []
    },
  })
}

/** Answer (or, with undo, take it back). The card changes at once; a refusal puts the list back as it was. */
export function useAnswerTask() {
  const { user } = useAuth()
  const client = useQueryClient()
  const tasks = key(user?.id)
  return useMutation({
    mutationFn: async ({ taskId, undo }: { taskId: string; undo: boolean }) => {
      const { error } = await supabase.rpc(undo ? 'undo_task_response' : 'respond_to_task', { p_task_id: taskId })
      if (error) throw error
    },
    onMutate: async ({ taskId, undo }) => {
      await client.cancelQueries({ queryKey: tasks })
      const before = client.getQueryData<MyTask[]>(tasks)
      client.setQueryData<MyTask[]>(tasks, rows => rows?.map(t => t.task_id === taskId ? { ...t, answered: !undo, outdated: false } : t))
      return { before }
    },
    onError: (_error, _vars, context) => client.setQueryData(tasks, context?.before),
    onSettled: () => client.invalidateQueries({ queryKey: tasks }),
  })
}

const dueMs = (t: MyTask) => (t.due_at ? Date.parse(t.due_at) : Infinity)

/** What My tasks shows at `now`: no "seen" receipts and nothing past its due time; Updated first, then soonest due,
 *  then no due time. */
export function tasksToShow(tasks: MyTask[], now: number): MyTask[] {
  return tasks
    .filter(t => t.answer_kind !== 'seen' && dueMs(t) > now)
    .sort((a, b) => Number(b.outdated) - Number(a.outdated) || dueMs(a) - dueMs(b) || 0)
}

/** "Due today" or "Due Sun 29 Nov", on the academy's clock. */
export function dueLabel(dueAt: string, timeZone: string, now = Date.now()): string {
  const day = (ms: number) => new Date(ms).toLocaleDateString('en-CA', { timeZone })
  if (day(Date.parse(dueAt)) === day(now)) return 'Due today'
  return `Due ${new Date(dueAt).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone })}`
}

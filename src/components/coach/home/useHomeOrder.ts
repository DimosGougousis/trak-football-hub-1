import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'

/* TRAK-613 (New Home 7/8): the coach's own order for the To-do, for one academy day and squad view ('all' or the squad),
   saved on the account so the phone and the laptop agree (coach_home_order; only the coach reads or writes it). A new
   day has no row, so it starts from Trak's order. */

const key = (coachId: string | undefined, day: string | null, view: string) => ['coach', coachId, 'home-order', day, view]

export function useHomeOrder(coachId: string | undefined, day: string | null, view: string) {
  const client = useQueryClient()
  const order = useQuery({
    queryKey: key(coachId, day, view),
    enabled: !!coachId && !!day,
    queryFn: async (): Promise<string[] | null> => {
      const { data, error } = await supabase.from('coach_home_order').select('item_keys')
        .eq('day', day!).eq('squad_view', view).maybeSingle()
      if (error) throw error
      return data?.item_keys ?? null
    },
  })
  const save = useMutation({
    mutationFn: async (keys: string[]) => {
      const { error } = await supabase.from('coach_home_order')
        .upsert({ day: day!, squad_view: view, item_keys: keys }, { onConflict: 'coach_user_id,day,squad_view' })
      if (error) throw error
    },
    // The list moves at once; a failed save puts it back.
    onMutate: async (keys: string[]) => {
      const before = client.getQueryData<string[] | null>(key(coachId, day, view))
      client.setQueryData(key(coachId, day, view), keys)
      return { before }
    },
    onError: (_error, _keys, context) => client.setQueryData(key(coachId, day, view), context?.before ?? null),
  })
  return { saved: order.data ?? null, save: save.mutate }
}

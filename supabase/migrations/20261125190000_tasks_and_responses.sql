-- TRAK-578 (coach–player P01, Makis's PR list of 23 Nov): tasks and answers. A coach asks a player to confirm
-- something; the player answers on their own copy with Got it, Done or Ready for review. Opening an item can also
-- record a silent "seen" (P03 creates those). No screen uses this yet: P02 adds My tasks to the player's Home.
--
--   switch off:  DELETE FROM public.academy_features WHERE organization_id = '<academy id>' AND feature = 'tasks';
--   on:          INSERT INTO public.academy_features(organization_id, feature) VALUES ('<academy id>', 'tasks');
-- It starts off for every academy. Off, every write refuses (42501) and my_tasks() returns no rows.
--
-- A copy is not a stored row. A squad task (no squad_player_id) belongs to the coach's squad (coach + age group, as
-- the season plan has it); every player with an active roster row in that squad has a copy, read at the moment it is
-- read. So a player who joins the roster sees the squad's open tasks that aren't due yet, and a player who leaves (row
-- no longer 'active') stops seeing them. An answer is stored per task and squad row, so a leaver's answers stay.
--
-- Outdated: each task carries its source's version. An answer records the version it answered. When the source moves
-- on (a later PR raises trak_tasks.source_version), a Got it or seen answer is outdated and the player is asked again;
-- Done and Ready for review are kept.
--
-- Who reads what: nothing here is a table policy, and no app role has a privilege on either table. Players read
-- through my_tasks() and write through respond_to_task() and undo_task_response(); coaches write through
-- create_task(). All four check: signed in, the caller's own copy (or the coach's own squad), the same academy, the
-- academy's tasks switch, consent for the child, and the task open and before its due time. A failed write raises
-- 42501 and writes nothing; my_tasks() simply has no row for it. Not in the data download yet, like event_absences
-- and season_plan_seen; deleting the account removes the answers (their squad row and user go). Parents don't read or answer yet (players only, Kostas 25
-- Nov); a parent PR adds them with a new migration. No count of who answered exists for anyone.

ALTER TABLE public.academy_features
  DROP CONSTRAINT academy_features_feature_check,
  ADD CONSTRAINT academy_features_feature_check
    CHECK (feature IN ('events', 'games', 'training', 'season_plan', 'family_look', 'tasks'));

CREATE TABLE public.trak_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  coach_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  squad text NOT NULL CHECK (squad = btrim(squad) AND squad <> ''),
  -- NULL: a squad task. Set: a task for this one player.
  squad_player_id uuid REFERENCES public.squad_players(id) ON DELETE CASCADE,
  audience text NOT NULL DEFAULT 'player' CHECK (audience = 'player'),
  -- What the task is about: 'manual' (create_task) and, from later PRs, the object a player opens from the card.
  source_type text NOT NULL,
  source_id uuid,
  source_version integer NOT NULL DEFAULT 1 CHECK (source_version >= 1),
  answer_kind text NOT NULL CHECK (answer_kind IN ('got_it', 'done', 'ready_for_review', 'seen')),
  title text NOT NULL CHECK (title = btrim(title) AND char_length(title) BETWEEN 1 AND 80),
  due_at timestamptz,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX trak_tasks_squad_idx ON public.trak_tasks (coach_user_id, squad) WHERE squad_player_id IS NULL;
CREATE INDEX trak_tasks_squad_player_idx ON public.trak_tasks (squad_player_id) WHERE squad_player_id IS NOT NULL;

-- The answer kind is the task's: a player can only give the answer the coach asked for.
CREATE TABLE public.task_responses (
  task_id uuid NOT NULL REFERENCES public.trak_tasks(id) ON DELETE CASCADE,
  squad_player_id uuid NOT NULL REFERENCES public.squad_players(id) ON DELETE CASCADE,
  responder_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_version integer NOT NULL,
  responded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (task_id, squad_player_id)
);
CREATE INDEX task_responses_squad_player_idx ON public.task_responses (squad_player_id);

ALTER TABLE public.trak_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_responses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.trak_tasks, public.task_responses FROM PUBLIC, anon, authenticated;

-- ── The caller's copies ────────────────────────────────────────────────────
-- One row per open task the caller can answer now, with the squad row their copy is under. p_child is the player:
-- NULL or the caller's own id; any other child has no rows (parents come later). DISTINCT ON keeps one copy per task
-- if a child ever has two active rows in the same squad.
CREATE FUNCTION trak_private.readable_tasks(p_child uuid)
RETURNS TABLE (task_id uuid, squad_player_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT DISTINCT ON (t.id) t.id, sp.id
  FROM public.squad_players sp
  JOIN public.trak_tasks t ON t.organization_id = sp.organization_id
   AND (t.squad_player_id = sp.id
        OR (t.squad_player_id IS NULL AND t.coach_user_id = sp.coach_user_id AND t.squad = btrim(sp.age_group)))
  WHERE sp.linked_player_id = (SELECT auth.uid())
    AND (p_child IS NULL OR p_child = (SELECT auth.uid()))
    AND sp.status = 'active'
    AND t.status = 'open'
    AND (t.due_at IS NULL OR t.due_at > now())
    AND EXISTS (SELECT 1 FROM public.academy_features f WHERE f.organization_id = sp.organization_id AND f.feature = 'tasks')
    AND NOT public.player_consent_required(sp.linked_player_id)
  ORDER BY t.id, sp.id;
$$;
REVOKE ALL ON FUNCTION trak_private.readable_tasks(uuid) FROM PUBLIC, anon, authenticated;

-- The caller's copy of one task, or 42501. Used by the two player writes.
CREATE FUNCTION trak_private.my_task_copy(p_task_id uuid, p_child uuid)
RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
 v_copy uuid;
BEGIN
 SELECT r.squad_player_id INTO v_copy FROM trak_private.readable_tasks(p_child) r WHERE r.task_id = p_task_id;
 IF v_copy IS NULL THEN
  RAISE EXCEPTION 'This task isn''t open for you' USING ERRCODE = '42501';
 END IF;
 RETURN v_copy;
END $$;
REVOKE ALL ON FUNCTION trak_private.my_task_copy(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- ── Player: read, answer, undo ─────────────────────────────────────────────
-- time_zone is the academy's, for showing the due date ("Due Sat 29 Nov") on the academy's clock.
CREATE FUNCTION public.my_tasks(p_child uuid DEFAULT NULL)
RETURNS TABLE (
  task_id uuid, title text, source_type text, source_id uuid, answer_kind text, due_at timestamptz,
  time_zone text, answered boolean, outdated boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT t.id, t.title, t.source_type, t.source_id, t.answer_kind, t.due_at,
    trak_private.academy_time_zone(t.organization_id),
    a.task_id IS NOT NULL,
    coalesce(a.source_version < t.source_version AND t.answer_kind IN ('got_it', 'seen'), false)
  FROM trak_private.readable_tasks(p_child) r
  JOIN public.trak_tasks t ON t.id = r.task_id
  LEFT JOIN public.task_responses a ON a.task_id = r.task_id AND a.squad_player_id = r.squad_player_id
  ORDER BY t.due_at NULLS LAST, t.created_at, t.id;
$$;

-- Answering again (after an update) records the task's current version.
CREATE FUNCTION public.respond_to_task(p_task_id uuid, p_child uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
 v_copy uuid := trak_private.my_task_copy(p_task_id, p_child);
BEGIN
 INSERT INTO public.task_responses (task_id, squad_player_id, responder_user_id, source_version)
 SELECT t.id, v_copy, (SELECT auth.uid()), t.source_version FROM public.trak_tasks t WHERE t.id = p_task_id
 ON CONFLICT (task_id, squad_player_id) DO UPDATE
  SET responder_user_id = EXCLUDED.responder_user_id, source_version = EXCLUDED.source_version, responded_at = now();
END $$;

CREATE FUNCTION public.undo_task_response(p_task_id uuid, p_child uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
 v_copy uuid := trak_private.my_task_copy(p_task_id, p_child);
BEGIN
 DELETE FROM public.task_responses a WHERE a.task_id = p_task_id AND a.squad_player_id = v_copy;
END $$;

-- ── Coach: send a task by hand ─────────────────────────────────────────────
-- To the coach's whole squad (p_squad_player_id NULL) or one active player on it. A personal task is a record about
-- the child, so it needs consent, like every other development write. "seen" is the app's own: a coach asks for one
-- of the three answers a player can tap. The due time, when given, is still ahead.
CREATE FUNCTION public.create_task(
  p_squad text, p_squad_player_id uuid, p_answer_kind text, p_title text, p_due_at timestamptz DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
 v_squad text := btrim(p_squad);
 v_org uuid := public.my_coach_organization_id();
 v_id uuid;
BEGIN
 IF (SELECT auth.uid()) IS NULL OR NOT public.is_coach() OR v_org IS NULL OR NOT trak_private.coaches_squad(v_squad) THEN
  RAISE EXCEPTION 'This squad isn''t one of yours' USING ERRCODE = '42501';
 END IF;
 IF NOT public.feature_on('tasks') THEN
  RAISE EXCEPTION 'Tasks are switched off for your academy' USING ERRCODE = '42501';
 END IF;
 IF p_squad_player_id IS NOT NULL AND NOT EXISTS (
   SELECT 1 FROM public.squad_players sp
   WHERE sp.id = p_squad_player_id AND sp.coach_user_id = (SELECT auth.uid()) AND btrim(sp.age_group) = v_squad
     AND sp.organization_id = v_org AND sp.status = 'active'
     AND NOT trak_private.squad_player_consent_required(sp.id)) THEN
  RAISE EXCEPTION 'This player isn''t on that squad, or is waiting for consent' USING ERRCODE = '42501';
 END IF;
 IF p_answer_kind IS NULL OR p_answer_kind NOT IN ('got_it', 'done', 'ready_for_review') THEN
  RAISE EXCEPTION 'Ask for Got it, Done or Ready for review' USING ERRCODE = '22023';
 END IF;
 IF p_due_at <= now() THEN
  RAISE EXCEPTION 'The due time has passed' USING ERRCODE = '22023';
 END IF;
 INSERT INTO public.trak_tasks (organization_id, coach_user_id, squad, squad_player_id, source_type, answer_kind, title, due_at)
 VALUES (v_org, (SELECT auth.uid()), v_squad, p_squad_player_id, 'manual', p_answer_kind, btrim(p_title), p_due_at)
 RETURNING id INTO v_id;
 RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION public.my_tasks(uuid), public.respond_to_task(uuid, uuid), public.undo_task_response(uuid, uuid),
  public.create_task(text, uuid, text, text, timestamptz) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.my_tasks(uuid), public.respond_to_task(uuid, uuid), public.undo_task_response(uuid, uuid),
  public.create_task(text, uuid, text, text, timestamptz) TO authenticated;
COMMENT ON FUNCTION public.my_tasks(uuid) IS
  'TRAK-578: the caller''s open tasks that aren''t due yet, with answered and outdated. Players only, for themselves. No rows with the tasks switch off, consent missing or the player off the roster.';
COMMENT ON FUNCTION public.respond_to_task(uuid, uuid) IS
  'TRAK-578: the player answers their own copy of a task with the answer it asks for. 42501 for anyone else, after the due time, with consent missing or the switch off.';
COMMENT ON FUNCTION public.undo_task_response(uuid, uuid) IS
  'TRAK-578: the player takes back their answer before the due time. Same checks as respond_to_task.';
COMMENT ON FUNCTION public.create_task(text, uuid, text, text, timestamptz) IS
  'TRAK-578: a coach sends a task by hand to their squad or one player on it. Checks the coach, the squad, the tasks switch, the player and their consent.';

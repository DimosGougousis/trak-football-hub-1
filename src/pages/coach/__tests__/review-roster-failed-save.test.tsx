import { describe, it, expect, beforeEach } from 'vitest'
import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { renderApp } from '../../../../tests/support/render-app'
import { logStep, trainingAt } from '../../../../tests/support/log-steps'
import { signInAs } from '../../../../tests/support/session'
import { registerAuthUser } from '../../../../tests/msw/auth-sessions'
import { server } from '../../../../tests/msw/server'
import { table, SUPABASE_URL } from '../../../../tests/msw/supabase'
import { supabase } from '@/integrations/supabase/client'

// Tarek's re-review of #126 at f843bc3: after a failed roster reload the squad
// is emptied but Save stays enabled, so the session saves with nobody in it and
// the screen reports success.
const COACH={id:'coach-1'}
const READY={id:'ready',coach_user_id:COACH.id,player_name:'Rea Ready',
 linked_player_id:'player-ready',position:'Defender',age_group:'U15',age:15}

// TRAK-182: walking the steps takes longer than 5 s on GitHub's runners.
describe('#126 re-review: a failed roster reload', { timeout: 20_000 }, () =>{
 beforeEach(()=>signInAs(COACH))
 it('does not save a session with the players the coach selected silently dropped',async()=>{
  let fail=false; const sessions: unknown[]=[]; const attendance: unknown[]=[]
  server.use(
   table('profiles',[{id:'p',user_id:COACH.id,role:'coach',full_name:'Coach',invite_code:'ABCD'}]),
   table('coach_sessions',[]),
   http.get(`${SUPABASE_URL}/rest/v1/squad_players`,()=> fail
    ? HttpResponse.json({message:'roster unavailable',code:'XX000'},{status:400}) : HttpResponse.json([READY])),
   http.post(`${SUPABASE_URL}/rest/v1/rpc/coach_squad_player_consent_required`,()=>HttpResponse.json(false)),
   http.post(`${SUPABASE_URL}/rest/v1/coach_sessions`,async({request})=>{
    const body=await request.json() as Record<string,unknown>; sessions.push(body)
    return HttpResponse.json({id:'session-1',...body},{status:201})
   }),
   http.post(`${SUPABASE_URL}/rest/v1/session_attendance`,async({request})=>{
    attendance.push(...await request.json() as unknown[]); return new HttpResponse(null,{status:201})
   }),
   http.post(`${SUPABASE_URL}/auth/v1/token`,()=>{
    const previous=JSON.parse(localStorage.getItem('sb-test-auth-token')!)
    const user=structuredClone(previous.user)
    return HttpResponse.json({...previous,user,access_token:registerAuthUser(user),
     expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600})
   }),
  )
  const user=userEvent.setup(); renderApp('/coach/sessions/add')
  await trainingAt('Attendance')
  await screen.findByRole('button',{name:/Rea Ready/})
  await user.click(screen.getByRole('button',{name:'ALL'}))
  fail=true
  await act(async()=>{const {error}=await supabase.auth.refreshSession();expect(error).toBeNull()})
  await screen.findByText(/Couldn't load your squad/)
  // TRAK-182: in steps, a failed roster keeps Next shut on Attendance, so the save is never reached.
  expect(screen.getByRole('button',{name:'Next'})).toBeDisabled()
  await act(async()=>{await new Promise(r=>setTimeout(r,100))})
  // Either Save waits for a successful retry, or it at least does not claim a
  // session the coach took attendance for was saved with nobody present.
  expect(sessions).toEqual([])
  expect(attendance).toEqual([])
 })

 // Tarek's #317 review: on Review, a failed roster greyed Save with no reason;
 // the note and its Retry were only on the step that lists the players.
 it('says why Save is off on Review, and Retry brings it back',async()=>{
  let fail=false; const sessions: unknown[]=[]
  server.use(
   table('profiles',[{id:'p',user_id:COACH.id,role:'coach',full_name:'Coach',invite_code:'ABCD'}]),
   table('coach_sessions',[]),
   http.get(`${SUPABASE_URL}/rest/v1/squad_players`,()=> fail
    ? HttpResponse.json({message:'roster unavailable',code:'XX000'},{status:400}) : HttpResponse.json([READY])),
   http.post(`${SUPABASE_URL}/rest/v1/rpc/coach_squad_player_consent_required`,()=>HttpResponse.json(false)),
   http.post(`${SUPABASE_URL}/rest/v1/coach_sessions`,async({request})=>{
    const body=await request.json() as Record<string,unknown>; sessions.push(body)
    return HttpResponse.json({id:'session-1',...body},{status:201})
   }),
   http.post(`${SUPABASE_URL}/auth/v1/token`,()=>{
    const previous=JSON.parse(localStorage.getItem('sb-test-auth-token')!)
    const user=structuredClone(previous.user)
    return HttpResponse.json({...previous,user,access_token:registerAuthUser(user),
     expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600})
   }),
  )
  const user=userEvent.setup(); renderApp('/coach/sessions/add')
  await trainingAt('Attendance')
  await screen.findByRole('button',{name:/Rea Ready/})
  await logStep('Review')
  fail=true
  await act(async()=>{const {error}=await supabase.auth.refreshSession();expect(error).toBeNull()})
  expect(await screen.findByText(/Couldn't load your squad/)).toBeInTheDocument()
  expect(screen.getByRole('button',{name:'Save session'})).toBeDisabled()
  fail=false
  await user.click(screen.getByRole('button',{name:'Retry'}))
  await waitFor(()=>expect(screen.getByRole('button',{name:'Save session'})).toBeEnabled())
  expect(sessions).toEqual([])
 })
})

import { setupServer } from 'msw/node'
import { authHandlers, consentBatchFromSingle, table } from './supabase'

// TRAK-312: the roster-wide consent check is answered from each test's single-child answers.
// TRAK-528: a player's page lists his sent reports; none unless a test says so.
export const server = setupServer(...authHandlers(), consentBatchFromSingle(), table('report_for_player', []))

import { setupServer } from 'msw/node'
import { authHandlers, consentBatchFromSingle } from './supabase'

// TRAK-312: the roster-wide consent check is answered from each test's single-child answers.
export const server = setupServer(...authHandlers(), consentBatchFromSingle())

import { setupServer } from 'msw/node'
import { authHandlers } from './supabase'

export const server = setupServer(...authHandlers())

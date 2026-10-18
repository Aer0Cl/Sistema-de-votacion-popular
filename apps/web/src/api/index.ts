import { createHttpApi } from './httpApi'
import { createMockApi } from './mockApi'
import { createSeed } from './seed'
import type { DevVotingApi } from './types'

export { ApiError } from './types'
export type * from './types'

const DEFAULT_USER = 'u-bob'

// Con VITE_API_URL (ver .env.example) se usa el backend real; sin ella, la API simulada
// en memoria, cuyos datos se reinician al recargar la pagina.
export const api: DevVotingApi = import.meta.env.VITE_API_URL
  ? createHttpApi(import.meta.env.VITE_API_URL, DEFAULT_USER)
  : createMockApi({ seed: createSeed(new Date()), userId: DEFAULT_USER, delayMs: 150 })

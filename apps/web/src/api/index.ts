import { createMockApi } from './mockApi'
import { createSeed } from './seed'

export { ApiError } from './types'
export type * from './types'

// Mientras no exista el backend (Fase 2) se usa la API simulada en memoria.
// Los datos se reinician al recargar la pagina.
export const api = createMockApi({
  seed: createSeed(new Date()),
  userId: 'u-bob',
  delayMs: 150,
})

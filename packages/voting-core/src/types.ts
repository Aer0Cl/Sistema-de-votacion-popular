export type VotingMethod = 'plurality' | 'ranked'

// Categoria del catalogo; es la misma en todas las votaciones que la incluyen
export type Category = {
  // nombre y año: "Mejor película" de 2026 -> "mejor-pelicula-2026" (ver categoryId)
  id: string
  name: string
  votingMethod: VotingMethod
  // edicion de la premiacion; forma parte del id, por eso no se puede cambiar. Opcional solo
  // para categorias creadas antes de que existiera
  year?: number
}

// Los nominados de una categoria son los mismos en todas las votaciones
export type Nominee = {
  id: string
  categoryId: string
  name: string
  description?: string
  imageUrl?: string
}

export type ElectionStatus = 'open' | 'closed'

export type Election = {
  id: string
  // identificador que se comparte para inscribirse (ver ELECTION_CODE_PATTERN)
  code: string
  // nombre que ven los usuarios, elegido por el administrador
  name: string
  closesAt: string
  categoryIds: string[]
  // solo ellos ven los resultados
  adminIds: string[]
  createdAt: string
}

export type ElectionMembership = {
  electionId: string
  userId: string
  joinedAt: string
}

export type User = {
  id: string
  displayName: string
  // solo 'admin' puede crear votaciones
  role: 'voter' | 'admin'
}

export type PluralityChoice = { nomineeId: string }

// ranking: ids de nominados en orden de preferencia
export type RankedChoice = { ranking: string[] }

export type AnswerChoice = PluralityChoice | RankedChoice

// Respuesta de un usuario a una categoria; se comparte entre todas sus votaciones
export type Answer = AnswerChoice & {
  userId: string
  categoryId: string
  updatedAt: string
}

// Foto de las respuestas de los participantes tomada al cerrar una votacion
export type ElectionSnapshot = {
  electionId: string
  takenAt: string
  answers: Answer[]
}

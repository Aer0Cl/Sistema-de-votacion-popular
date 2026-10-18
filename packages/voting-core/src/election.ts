import type {
  Answer,
  AnswerChoice,
  Category,
  Election,
  ElectionStatus,
  Nominee,
} from './types'

export const ELECTION_CODE_PATTERN = /^[A-Z0-9]{6,8}$/
export const MIN_CATEGORIES = 2
export const MAX_CATEGORIES = 24
// minimo de nominados para que una categoria se pueda usar en una votacion
export const MIN_NOMINEES = 2

// MVP: los rankings deben ordenar a todos los nominados. Cuando se permitan rankings
// parciales basta con cambiar este valor (el conteo ya maneja papeletas agotadas).
export const REQUIRE_COMPLETE_RANKING = true

// Los codigos se comparan sin distinguir mayusculas
export function normalizeElectionCode(code: string): string {
  return code.trim().toUpperCase()
}

export function isValidElectionCode(code: string): boolean {
  return ELECTION_CODE_PATTERN.test(normalizeElectionCode(code))
}

export function getElectionStatus(
  election: Pick<Election, 'closesAt'>,
  now: Date,
): ElectionStatus {
  return now.getTime() < new Date(election.closesAt).getTime() ? 'open' : 'closed'
}

export type NewElectionInput = {
  name: string
  closesAt: string
  categoryIds: string[]
}

export function validateNewElection(
  input: NewElectionInput,
  catalog: readonly Category[],
  nominees: readonly Nominee[],
  now: Date,
): string[] {
  const errors: string[] = []

  if (input.name.trim() === '') {
    errors.push('La votacion necesita un nombre.')
  }

  const closesAt = new Date(input.closesAt).getTime()
  if (Number.isNaN(closesAt)) {
    errors.push('La fecha de termino no es valida.')
  } else if (closesAt <= now.getTime()) {
    errors.push('La fecha de termino debe ser futura.')
  }

  const categoryIds = new Set(input.categoryIds)
  if (categoryIds.size < MIN_CATEGORIES || categoryIds.size > MAX_CATEGORIES) {
    errors.push(`Elige entre ${MIN_CATEGORIES} y ${MAX_CATEGORIES} categorias.`)
  }

  const known = new Set(catalog.map((category) => category.id))
  if ([...categoryIds].some((id) => !known.has(id))) {
    errors.push('Hay categorias que no existen en el catalogo.')
  }

  const withoutNominees = catalog.filter(
    (category) =>
      categoryIds.has(category.id) &&
      nominees.filter((nominee) => nominee.categoryId === category.id).length <
        MIN_NOMINEES,
  )
  if (withoutNominees.length > 0) {
    const names = withoutNominees.map((category) => category.name).join(', ')
    errors.push(
      `Estas categorias necesitan al menos ${MIN_NOMINEES} nominados: ${names}.`,
    )
  }

  return errors
}

// Devuelve un mensaje de error, o null si la respuesta es valida para la categoria
export function validateAnswerChoice(
  category: Category,
  nominees: readonly Nominee[],
  choice: AnswerChoice,
  options: { requireCompleteRanking?: boolean } = {},
): string | null {
  const requireCompleteRanking =
    options.requireCompleteRanking ?? REQUIRE_COMPLETE_RANKING
  const ids = new Set(
    nominees.filter((nominee) => nominee.categoryId === category.id).map((n) => n.id),
  )

  if (category.votingMethod === 'plurality') {
    if (!('nomineeId' in choice)) {
      return 'Esta categoria se responde eligiendo un nominado.'
    }
    return ids.has(choice.nomineeId) ? null : 'El nominado no pertenece a la categoria.'
  }

  if (!('ranking' in choice)) {
    return 'Esta categoria se responde ordenando a los nominados.'
  }
  if (choice.ranking.length === 0) {
    return 'El ranking debe tener al menos un nominado.'
  }
  if (new Set(choice.ranking).size !== choice.ranking.length) {
    return 'El ranking tiene nominados repetidos.'
  }
  if (choice.ranking.some((id) => !ids.has(id))) {
    return 'El ranking incluye nominados que no pertenecen a la categoria.'
  }
  if (requireCompleteRanking && choice.ranking.length !== ids.size) {
    return 'El ranking debe ordenar a todos los nominados.'
  }
  return null
}

/**
 * Foto de una votacion al cerrar: para cada participante y categoria, la ultima version
 * de su respuesta guardada antes de la fecha de termino. Los cambios posteriores no cuentan,
 * aunque la foto se tome unos segundos despues del cierre.
 */
export function snapshotAnswers(
  history: readonly Answer[],
  election: Pick<Election, 'closesAt' | 'categoryIds'>,
  memberIds: readonly string[],
): Answer[] {
  const closesAt = new Date(election.closesAt).getTime()
  const members = new Set(memberIds)
  const categories = new Set(election.categoryIds)
  const latest = new Map<string, Answer>()

  for (const answer of history) {
    const updatedAt = new Date(answer.updatedAt).getTime()
    if (
      updatedAt >= closesAt ||
      !members.has(answer.userId) ||
      !categories.has(answer.categoryId)
    ) {
      continue
    }

    const key = `${answer.userId}|${answer.categoryId}`
    const current = latest.get(key)
    if (!current || new Date(current.updatedAt).getTime() <= updatedAt) {
      latest.set(key, answer)
    }
  }

  return [...latest.values()]
}

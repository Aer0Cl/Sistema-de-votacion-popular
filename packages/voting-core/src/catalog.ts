import type { Category, Election, Nominee, VotingMethod } from './types'

export type NewCategoryInput = {
  name: string
  votingMethod: VotingMethod
}

export type NomineeInput = {
  name: string
  description?: string
}

/**
 * Una categoria usada en alguna votacion (abierta o cerrada) no se puede eliminar, cambiar de
 * metodo ni recibir nominados nuevos: cambiaria respuestas ya guardadas y, en ranking, dejaria
 * rankings incompletos. Los nombres se pueden editar siempre. Los nominados nunca se eliminan.
 */
export function isCategoryLocked(
  categoryId: string,
  elections: readonly Pick<Election, 'categoryIds'>[],
): boolean {
  return elections.some((election) => election.categoryIds.includes(categoryId))
}

function sameName(a: string, b: string): boolean {
  return a.trim().toLocaleLowerCase('es') === b.trim().toLocaleLowerCase('es')
}

// excludeId: la categoria que se esta renombrando
export function validateCategoryName(
  name: string,
  catalog: readonly Category[],
  excludeId?: string,
): string | null {
  if (name.trim() === '') {
    return 'La categoria necesita un nombre.'
  }
  const duplicate = catalog.some(
    (category) => category.id !== excludeId && sameName(category.name, name),
  )
  return duplicate ? 'Ya existe una categoria con ese nombre.' : null
}

export function validateNomineeName(
  name: string,
  categoryId: string,
  nominees: readonly Nominee[],
  excludeId?: string,
): string | null {
  if (name.trim() === '') {
    return 'El nominado necesita un nombre.'
  }
  const duplicate = nominees.some(
    (nominee) =>
      nominee.categoryId === categoryId &&
      nominee.id !== excludeId &&
      sameName(nominee.name, name),
  )
  return duplicate ? 'Ya existe un nominado con ese nombre en la categoria.' : null
}

// Id legible a partir del nombre ("Mejor dirección" -> "mejor-direccion"), unico entre `taken`
export function slugId(name: string, taken: ReadonlySet<string>): string {
  const base =
    name
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'item'

  let id = base
  for (let suffix = 2; taken.has(id); suffix += 1) {
    id = `${base}-${suffix}`
  }
  return id
}

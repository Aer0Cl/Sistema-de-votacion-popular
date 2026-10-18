import type { Category, Election, Nominee, VotingMethod } from './types'

export type NewCategoryInput = {
  name: string
  votingMethod: VotingMethod
  // al crear: por defecto el año actual. Al editar: si se envia, debe ser el mismo
  year?: number
}

// Rango aceptado para el año de una categoria (edicion de la premiacion)
export const MIN_CATEGORY_YEAR = 1900
export const MAX_CATEGORY_YEAR = 2100

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

// El nombre no se repite dentro de un mismo año ("Mejor película" puede existir en 2025 y en
// 2026). excludeId: la categoria que se esta renombrando
export function validateCategoryName(
  name: string,
  year: number | undefined,
  catalog: readonly Category[],
  excludeId?: string,
): string | null {
  if (name.trim() === '') {
    return 'La categoria necesita un nombre.'
  }
  const duplicate = catalog.some(
    (category) =>
      category.id !== excludeId &&
      category.year === year &&
      sameName(category.name, name),
  )
  return duplicate ? 'Ya existe una categoria con ese nombre en ese año.' : null
}

export function validateCategoryYear(year: unknown): string | null {
  if (
    typeof year !== 'number' ||
    !Number.isInteger(year) ||
    year < MIN_CATEGORY_YEAR ||
    year > MAX_CATEGORY_YEAR
  ) {
    return `El año debe ser un numero entero entre ${MIN_CATEGORY_YEAR} y ${MAX_CATEGORY_YEAR}.`
  }
  return null
}

// Id de una categoria nueva a partir de su nombre y año, unico entre `taken`
export function categoryId(
  name: string,
  year: number,
  taken: ReadonlySet<string>,
): string {
  return slugId(`${name} ${year}`, taken)
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

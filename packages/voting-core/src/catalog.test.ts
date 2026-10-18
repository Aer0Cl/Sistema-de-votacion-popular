import { describe, expect, it } from 'vitest'
import {
  categoryId,
  isCategoryLocked,
  slugId,
  validateCategoryName,
  validateCategoryYear,
  validateNomineeName,
} from './catalog'
import type { Category, Nominee } from './types'

const catalog: Category[] = [
  { id: 'mejor-actor-2026', name: 'Mejor actor', votingMethod: 'plurality', year: 2026 },
  {
    id: 'mejor-actriz-2026',
    name: 'Mejor actriz',
    votingMethod: 'plurality',
    year: 2026,
  },
]

const nominees: Nominee[] = [
  { id: 'n1', categoryId: 'mejor-actor', name: 'Ana' },
  { id: 'n2', categoryId: 'mejor-actriz', name: 'Bea' },
]

describe('isCategoryLocked', () => {
  it('bloquea las categorias usadas en alguna votacion', () => {
    const elections = [{ categoryIds: ['mejor-actor'] }]

    expect(isCategoryLocked('mejor-actor', elections)).toBe(true)
    expect(isCategoryLocked('mejor-actriz', elections)).toBe(false)
  })
})

describe('validateCategoryName', () => {
  it('rechaza nombres vacios o repetidos en el mismo año sin distinguir mayusculas', () => {
    expect(validateCategoryName('  ', 2026, catalog)).not.toBeNull()
    expect(validateCategoryName(' MEJOR ACTOR ', 2026, catalog)).not.toBeNull()
    expect(validateCategoryName('Mejor sonido', 2026, catalog)).toBeNull()
  })

  it('permite el mismo nombre en otro año', () => {
    expect(validateCategoryName('Mejor actor', 2027, catalog)).toBeNull()
  })

  it('permite conservar el nombre al renombrar la misma categoria', () => {
    expect(
      validateCategoryName('Mejor actor', 2026, catalog, 'mejor-actor-2026'),
    ).toBeNull()
  })
})

describe('validateCategoryYear', () => {
  it('acepta años enteros dentro del rango', () => {
    expect(validateCategoryYear(2026)).toBeNull()
    for (const year of [1899, 2101, 2026.5, '2026', undefined]) {
      expect(validateCategoryYear(year)).not.toBeNull()
    }
  })
})

describe('categoryId', () => {
  it('combina el nombre y el año', () => {
    expect(categoryId('Mejor película', 2026, new Set())).toBe('mejor-pelicula-2026')
    expect(categoryId('Mejor película', 2026, new Set(['mejor-pelicula-2026']))).toBe(
      'mejor-pelicula-2026-2',
    )
  })
})

describe('validateNomineeName', () => {
  it('solo exige nombres unicos dentro de la categoria', () => {
    expect(validateNomineeName('ana', 'mejor-actor', nominees)).not.toBeNull()
    expect(validateNomineeName('Ana', 'mejor-actriz', nominees)).toBeNull()
    expect(validateNomineeName('Ana', 'mejor-actor', nominees, 'n1')).toBeNull()
    expect(validateNomineeName('', 'mejor-actor', nominees)).not.toBeNull()
  })
})

describe('slugId', () => {
  it('genera ids legibles y unicos', () => {
    expect(slugId('Mejor dirección', new Set())).toBe('mejor-direccion')
    expect(slugId('Mejor actor', new Set(['mejor-actor']))).toBe('mejor-actor-2')
    expect(slugId('¡¡!!', new Set())).toBe('item')
  })
})

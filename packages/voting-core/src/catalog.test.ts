import { describe, expect, it } from 'vitest'
import {
  isCategoryLocked,
  slugId,
  validateCategoryName,
  validateNomineeName,
} from './catalog'
import type { Category, Nominee } from './types'

const catalog: Category[] = [
  { id: 'mejor-actor', name: 'Mejor actor', votingMethod: 'plurality' },
  { id: 'mejor-actriz', name: 'Mejor actriz', votingMethod: 'plurality' },
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
  it('rechaza nombres vacios o repetidos sin distinguir mayusculas', () => {
    expect(validateCategoryName('  ', catalog)).not.toBeNull()
    expect(validateCategoryName(' MEJOR ACTOR ', catalog)).not.toBeNull()
    expect(validateCategoryName('Mejor sonido', catalog)).toBeNull()
  })

  it('permite conservar el nombre al renombrar la misma categoria', () => {
    expect(validateCategoryName('Mejor actor', catalog, 'mejor-actor')).toBeNull()
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

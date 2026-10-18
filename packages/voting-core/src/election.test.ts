import { describe, expect, it } from 'vitest'
import {
  getElectionStatus,
  isValidElectionCode,
  snapshotAnswers,
  validateAnswerChoice,
  validateNewElection,
} from './election'
import type { Answer, Category, Nominee } from './types'

const catalog: Category[] = [
  { id: 'pelicula', name: 'Mejor pelicula', votingMethod: 'ranked' },
  { id: 'actor', name: 'Mejor actor', votingMethod: 'plurality' },
  { id: 'actriz', name: 'Mejor actriz', votingMethod: 'plurality' },
]

const nominees: Nominee[] = [
  { id: 'p1', categoryId: 'pelicula', name: 'P1' },
  { id: 'p2', categoryId: 'pelicula', name: 'P2' },
  { id: 'a1', categoryId: 'actor', name: 'A1' },
  { id: 'a2', categoryId: 'actor', name: 'A2' },
]

const now = new Date('2027-01-10T12:00:00Z')

describe('isValidElectionCode', () => {
  it.each(['ABC123', 'abc123', 'ABCD1234', ' OSC7K2 '])('acepta %s', (code) => {
    expect(isValidElectionCode(code)).toBe(true)
  })

  it.each(['ABC12', 'ABCDE12345', 'ABC-123', 'ÑANDU12', ''])('rechaza %s', (code) => {
    expect(isValidElectionCode(code)).toBe(false)
  })
})

describe('getElectionStatus', () => {
  it('esta abierta hasta la fecha de termino y cerrada desde ese instante', () => {
    expect(getElectionStatus({ closesAt: '2027-01-10T12:00:01Z' }, now)).toBe('open')
    expect(getElectionStatus({ closesAt: '2027-01-10T12:00:00Z' }, now)).toBe('closed')
  })
})

describe('validateNewElection', () => {
  const valid = {
    name: 'Oficina',
    closesAt: '2027-02-01T00:00:00Z',
    categoryIds: ['pelicula', 'actor'],
  }

  it('acepta una votacion valida', () => {
    expect(validateNewElection(valid, catalog, nominees, now)).toEqual([])
  })

  it('exige al menos 2 categorias distintas', () => {
    const errors = validateNewElection(
      { ...valid, categoryIds: ['actor', 'actor'] },
      catalog,
      nominees,
      now,
    )

    expect(errors).toEqual(['Elige entre 2 y 24 categorias.'])
  })

  it('rechaza mas de 24 categorias', () => {
    const big = Array.from({ length: 25 }, (_, index) => ({
      id: `c${index}`,
      name: `C${index}`,
      votingMethod: 'plurality' as const,
    }))
    const errors = validateNewElection(
      { ...valid, categoryIds: big.map((category) => category.id) },
      big,
      big.flatMap((category) => [
        { id: `${category.id}-1`, categoryId: category.id, name: '1' },
        { id: `${category.id}-2`, categoryId: category.id, name: '2' },
      ]),
      now,
    )

    expect(errors).toEqual(['Elige entre 2 y 24 categorias.'])
  })

  it('rechaza nombre vacio, fecha pasada y categorias desconocidas', () => {
    const errors = validateNewElection(
      { name: '  ', closesAt: '2027-01-01T00:00:00Z', categoryIds: ['actor', 'zzz'] },
      catalog,
      nominees,
      now,
    )

    expect(errors).toEqual([
      'La votacion necesita un nombre.',
      'La fecha de termino debe ser futura.',
      'Hay categorias que no existen en el catalogo.',
    ])
  })
})

describe('validateNewElection: nominados', () => {
  it('exige al menos 2 nominados en cada categoria elegida', () => {
    const errors = validateNewElection(
      { name: 'X', closesAt: '2027-02-01T00:00:00Z', categoryIds: ['actor', 'actriz'] },
      catalog,
      nominees,
      now,
    )

    expect(errors).toEqual([
      'Estas categorias necesitan al menos 2 nominados: Mejor actriz.',
    ])
  })
})

describe('validateAnswerChoice', () => {
  const [pelicula, actor] = catalog

  it('exige ordenar a todos los nominados en ranking (MVP)', () => {
    expect(validateAnswerChoice(pelicula, nominees, { ranking: ['p2'] })).toBe(
      'El ranking debe ordenar a todos los nominados.',
    )
  })

  it('acepta rankings parciales si se desactiva la regla', () => {
    expect(
      validateAnswerChoice(
        pelicula,
        nominees,
        { ranking: ['p2'] },
        { requireCompleteRanking: false },
      ),
    ).toBeNull()
  })

  it('acepta respuestas validas', () => {
    expect(validateAnswerChoice(actor, nominees, { nomineeId: 'a1' })).toBeNull()
    expect(validateAnswerChoice(pelicula, nominees, { ranking: ['p2', 'p1'] })).toBeNull()
  })

  it('exige el formato de respuesta del metodo de la categoria', () => {
    expect(validateAnswerChoice(actor, nominees, { ranking: ['a1'] })).not.toBeNull()
    expect(validateAnswerChoice(pelicula, nominees, { nomineeId: 'p1' })).not.toBeNull()
  })

  it('rechaza nominados de otra categoria, repetidos o rankings vacios', () => {
    expect(validateAnswerChoice(actor, nominees, { nomineeId: 'p1' })).not.toBeNull()
    expect(
      validateAnswerChoice(pelicula, nominees, { ranking: ['p1', 'p1'] }),
    ).not.toBeNull()
    expect(validateAnswerChoice(pelicula, nominees, { ranking: [] })).not.toBeNull()
    expect(
      validateAnswerChoice(pelicula, nominees, { ranking: ['p1', 'a1'] }),
    ).not.toBeNull()
  })
})

describe('snapshotAnswers', () => {
  const election = {
    closesAt: '2027-03-01T00:00:00Z',
    categoryIds: ['pelicula', 'actor'],
  }

  function answer(
    userId: string,
    categoryId: string,
    updatedAt: string,
    nomineeId: string,
  ): Answer {
    return { userId, categoryId, updatedAt, nomineeId }
  }

  it('toma la ultima respuesta anterior al cierre e ignora los cambios posteriores', () => {
    const history = [
      answer('ana', 'actor', '2027-02-01T00:00:00Z', 'a1'),
      answer('ana', 'actor', '2027-02-20T00:00:00Z', 'a2'),
      answer('ana', 'actor', '2027-03-05T00:00:00Z', 'a1'),
    ]

    expect(snapshotAnswers(history, election, ['ana'])).toEqual([history[1]])
  })

  it('excluye una respuesta guardada justo en la fecha de termino (ya esta cerrada)', () => {
    const history = [answer('ana', 'actor', '2027-03-01T00:00:00Z', 'a1')]

    expect(snapshotAnswers(history, election, ['ana'])).toEqual([])
  })

  it('solo incluye participantes y categorias de la votacion', () => {
    const history = [
      answer('ana', 'actor', '2027-02-01T00:00:00Z', 'a1'),
      answer('bob', 'actor', '2027-02-01T00:00:00Z', 'a2'),
      answer('ana', 'actriz', '2027-02-01T00:00:00Z', 'x'),
    ]

    expect(snapshotAnswers(history, election, ['ana'])).toEqual([history[0]])
  })

  it('no depende del orden del historial', () => {
    const history = [
      answer('ana', 'actor', '2027-02-20T00:00:00Z', 'a2'),
      answer('ana', 'actor', '2027-02-01T00:00:00Z', 'a1'),
    ]

    expect(snapshotAnswers(history, election, ['ana'])).toEqual([history[0]])
  })
})

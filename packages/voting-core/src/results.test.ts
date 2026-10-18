import { describe, expect, it } from 'vitest'
import { tallyElection } from './results'
import type { Answer, Category, Nominee } from './types'

const categories: Category[] = [
  { id: 'pelicula', name: 'Mejor pelicula', votingMethod: 'ranked' },
  { id: 'actor', name: 'Mejor actor', votingMethod: 'plurality' },
]

const nominees: Nominee[] = [
  { id: 'p1', categoryId: 'pelicula', name: 'P1' },
  { id: 'p2', categoryId: 'pelicula', name: 'P2' },
  { id: 'p3', categoryId: 'pelicula', name: 'P3' },
  { id: 'a1', categoryId: 'actor', name: 'A1' },
  { id: 'a2', categoryId: 'actor', name: 'A2' },
]

const at = '2027-02-01T00:00:00Z'

describe('tallyElection', () => {
  it('cuenta cada categoria con su metodo', () => {
    const answers: Answer[] = [
      { userId: 'u1', categoryId: 'pelicula', updatedAt: at, ranking: ['p1', 'p2', 'p3'] },
      { userId: 'u2', categoryId: 'pelicula', updatedAt: at, ranking: ['p2', 'p1', 'p3'] },
      { userId: 'u3', categoryId: 'pelicula', updatedAt: at, ranking: ['p3', 'p2', 'p1'] },
      { userId: 'u4', categoryId: 'pelicula', updatedAt: at, ranking: ['p2', 'p3', 'p1'] },
      { userId: 'u1', categoryId: 'actor', updatedAt: at, nomineeId: 'a2' },
      { userId: 'u2', categoryId: 'actor', updatedAt: at, nomineeId: 'a2' },
      { userId: 'u3', categoryId: 'actor', updatedAt: at, nomineeId: 'a1' },
    ]

    const [pelicula, actor] = tallyElection(categories, nominees, answers)

    expect(pelicula.votingMethod).toBe('ranked')
    expect(pelicula.result.winners).toEqual(['p2'])
    expect(actor.votingMethod).toBe('plurality')
    expect(actor.result.winners).toEqual(['a2'])
  })

  it('devuelve resultado vacio para categorias sin respuestas', () => {
    const [pelicula, actor] = tallyElection(categories, nominees, [])

    expect(pelicula.result.winners).toEqual([])
    expect(actor.result.totalBallots).toBe(0)
  })
})

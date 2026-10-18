import { describe, expect, it } from 'vitest'
import { createMockApi } from './mockApi'
import type { SeedData } from './seed'

const DAY = 24 * 60 * 60 * 1000
const start = new Date('2027-02-01T00:00:00Z')

const picture = ['p1', 'p2', 'p3']

function createSeed(): SeedData {
  return {
    users: [
      { id: 'admin', displayName: 'Admin', role: 'admin' },
      { id: 'ana', displayName: 'Ana', role: 'voter' },
    ],
    categories: [
      { id: 'pelicula', name: 'Mejor pelicula', votingMethod: 'ranked' },
      { id: 'actor', name: 'Mejor actor', votingMethod: 'plurality' },
      { id: 'actriz', name: 'Mejor actriz', votingMethod: 'plurality' },
    ],
    nominees: [
      ...picture.map((id) => ({ id, categoryId: 'pelicula', name: id })),
      { id: 'a1', categoryId: 'actor', name: 'a1' },
      { id: 'a2', categoryId: 'actor', name: 'a2' },
      { id: 'x1', categoryId: 'actriz', name: 'x1' },
    ],
    elections: [
      {
        id: 'A',
        code: 'AAAAAA',
        name: 'A',
        closesAt: new Date(start.getTime() + 10 * DAY).toISOString(),
        categoryIds: ['pelicula', 'actor'],
        adminIds: ['admin'],
        createdAt: start.toISOString(),
      },
      {
        id: 'B',
        code: 'BBBBBB',
        name: 'B',
        closesAt: new Date(start.getTime() + 20 * DAY).toISOString(),
        categoryIds: ['pelicula', 'actriz'],
        adminIds: ['admin'],
        createdAt: start.toISOString(),
      },
    ],
    memberships: [],
    answerHistory: [],
  }
}

function setup() {
  let current = start
  const api = createMockApi({ seed: createSeed(), userId: 'ana', now: () => current })
  const advance = (days: number) => {
    current = new Date(current.getTime() + days * DAY)
  }
  return { api, advance }
}

describe('mockApi', () => {
  it('una respuesta vale para todas las votaciones abiertas y la cerrada conserva su foto', async () => {
    const { api, advance } = setup()
    await api.joinElection('aaaaaa')
    await api.joinElection('BBBBBB')

    await api.saveAnswer('pelicula', { ranking: ['p1', 'p2', 'p3'] })
    expect((await api.getElection('AAAAAA')).myAnswers[0]).toMatchObject({
      ranking: ['p1', 'p2', 'p3'],
    })
    expect((await api.getElection('BBBBBB')).myAnswers[0]).toMatchObject({
      ranking: ['p1', 'p2', 'p3'],
    })

    advance(15) // A cerro, B sigue abierta
    await api.saveAnswer('pelicula', { ranking: ['p2', 'p1', 'p3'] })

    const a = await api.getElection('AAAAAA')
    const b = await api.getElection('BBBBBB')
    expect(a.status).toBe('closed')
    expect(a.myAnswers[0]).toMatchObject({ ranking: ['p1', 'p2', 'p3'] })
    expect(b.myAnswers[0]).toMatchObject({ ranking: ['p2', 'p1', 'p3'] })

    api.setUser('admin')
    const results = await api.getResults('AAAAAA')
    expect(results.snapshotTakenAt).toBeDefined()
    expect(results.results[0].result.winners).toEqual(['p1'])
  })

  it('no permite responder categorias que solo estan en votaciones cerradas', async () => {
    const { api, advance } = setup()
    await api.joinElection('AAAAAA')
    await api.saveAnswer('actor', { nomineeId: 'a1' })

    advance(15)

    await expect(api.saveAnswer('actor', { nomineeId: 'a2' })).rejects.toMatchObject({
      status: 403,
    })
  })

  it('no permite responder categorias de votaciones en las que no participa', async () => {
    const { api } = setup()
    await api.joinElection('AAAAAA')

    await expect(api.saveAnswer('actriz', { nomineeId: 'x1' })).rejects.toMatchObject({
      status: 403,
    })
  })

  it('valida la respuesta segun el metodo de la categoria', async () => {
    const { api } = setup()
    await api.joinElection('AAAAAA')

    await expect(api.saveAnswer('pelicula', { nomineeId: 'p1' })).rejects.toMatchObject({
      status: 400,
    })
  })

  it('no permite unirse a una votacion cerrada', async () => {
    const { api, advance } = setup()
    advance(15)

    await expect(api.joinElection('AAAAAA')).rejects.toMatchObject({ status: 409 })
  })

  it('solo los administradores de la votacion ven los resultados', async () => {
    const { api } = setup()
    await api.joinElection('AAAAAA')

    await expect(api.getResults('AAAAAA')).rejects.toMatchObject({ status: 403 })
  })

  it('solo los administradores crean votaciones, con codigo de 8 caracteres', async () => {
    const { api } = setup()
    const input = {
      name: 'Nueva',
      closesAt: new Date(start.getTime() + DAY).toISOString(),
      categoryIds: ['pelicula', 'actor'],
    }

    await expect(api.createElection(input)).rejects.toMatchObject({ status: 403 })

    api.setUser('admin')
    const created = await api.createElection(input)
    expect(created.code).toMatch(/^[A-Z0-9]{8}$/)
    expect(created.isAdmin).toBe(true)
  })
})

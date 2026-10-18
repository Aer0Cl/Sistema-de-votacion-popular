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
      { id: 'pelicula', name: 'Mejor pelicula', votingMethod: 'ranked', year: 2027 },
      { id: 'actor', name: 'Mejor actor', votingMethod: 'plurality', year: 2027 },
      { id: 'actriz', name: 'Mejor actriz', votingMethod: 'plurality', year: 2027 },
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

  it('exige ordenar a todos los nominados en ranking', async () => {
    const { api } = setup()
    await api.joinElection('AAAAAA')

    await expect(
      api.saveAnswer('pelicula', { ranking: ['p1', 'p2'] }),
    ).rejects.toMatchObject({
      status: 400,
    })
  })

  describe('abandonar una votacion', () => {
    it('deja de contar sus respuestas ahi pero las conserva para las demas', async () => {
      const { api } = setup()
      await api.joinElection('AAAAAA')
      await api.joinElection('BBBBBB')
      await api.saveAnswer('pelicula', { ranking: ['p1', 'p2', 'p3'] })

      expect(await api.leaveElection('AAAAAA')).toBeNull()

      expect((await api.listMyElections()).map((election) => election.code)).toEqual([
        'BBBBBB',
      ])
      expect((await api.getElection('BBBBBB')).myAnswers).toHaveLength(1)
      api.setUser('admin')
      expect((await api.getResults('AAAAAA')).results[0].result.totalBallots).toBe(0)
    })

    it('al quedar sin votaciones abiertas con la categoria ya no puede responderla', async () => {
      const { api } = setup()
      await api.joinElection('AAAAAA')
      await api.leaveElection('AAAAAA')

      await expect(api.saveAnswer('actor', { nomineeId: 'a1' })).rejects.toMatchObject({
        status: 403,
      })
    })

    it('no permite abandonar una votacion cerrada', async () => {
      const { api, advance } = setup()
      await api.joinElection('AAAAAA')
      advance(15)

      await expect(api.leaveElection('AAAAAA')).rejects.toMatchObject({ status: 409 })
    })

    it('el administrador sigue viendo la votacion despues de abandonarla', async () => {
      const { api } = setup()
      api.setUser('admin')
      await api.joinElection('AAAAAA')

      const election = await api.leaveElection('AAAAAA')

      expect(election).toMatchObject({ isMember: false, isAdmin: true })
    })
  })

  describe('catalogo', () => {
    it('solo los administradores lo gestionan', async () => {
      const { api } = setup()

      await expect(api.listCatalog()).rejects.toMatchObject({ status: 403 })
      await expect(
        api.createCategory({ name: 'Mejor sonido', votingMethod: 'plurality' }),
      ).rejects.toMatchObject({ status: 403 })
    })

    it('crea categorias y nominados, que quedan disponibles para nuevas votaciones', async () => {
      const { api } = setup()
      api.setUser('admin')

      const created = await api.createCategory({
        name: 'Mejor sonido',
        votingMethod: 'plurality',
      })
      // Sin año se usa el actual (el reloj del test esta en 2027)
      expect(created).toMatchObject({
        id: 'mejor-sonido-2027',
        year: 2027,
        locked: false,
        nominees: [],
      })

      await api.addNominee(created.id, { name: 'Dune' })
      const updated = await api.addNominee(created.id, {
        name: 'Oppenheimer',
        description: '2023',
      })
      expect(updated.nominees.map((nominee) => nominee.name)).toEqual([
        'Dune',
        'Oppenheimer',
      ])

      const election = await api.createElection({
        name: 'Con sonido',
        closesAt: new Date(start.getTime() + DAY).toISOString(),
        categoryIds: ['actor', created.id],
      })
      expect(election.categoryIds).toContain('mejor-sonido-2027')
    })

    it('arma el id con el nombre y el año, y no repite nombres en el mismo año', async () => {
      const { api } = setup()
      api.setUser('admin')

      const of2026 = await api.createCategory({
        name: 'Mejor sonido',
        votingMethod: 'plurality',
        year: 2026,
      })
      const of2027 = await api.createCategory({
        name: 'Mejor sonido',
        votingMethod: 'plurality',
        year: 2027,
      })
      expect([of2026.id, of2027.id]).toEqual(['mejor-sonido-2026', 'mejor-sonido-2027'])

      await expect(
        api.createCategory({ name: 'MEJOR SONIDO', votingMethod: 'ranked', year: 2026 }),
      ).rejects.toMatchObject({ status: 400 })
      await expect(
        api.createCategory({ name: 'Otra', votingMethod: 'ranked', year: 1800 }),
      ).rejects.toMatchObject({ status: 400 })
      await expect(
        api.updateCategory(of2026.id, {
          name: 'Mejor sonido',
          votingMethod: 'plurality',
          year: 2028,
        }),
      ).rejects.toMatchObject({ status: 400 })

      const renamed = await api.updateCategory(of2026.id, {
        name: 'Mejor mezcla de sonido',
        votingMethod: 'plurality',
      })
      expect(renamed).toMatchObject({ id: 'mejor-sonido-2026', year: 2026 })
    })

    it('no permite crear votaciones con categorias de menos de 2 nominados', async () => {
      const { api } = setup()
      api.setUser('admin')
      const created = await api.createCategory({
        name: 'Mejor sonido',
        votingMethod: 'plurality',
      })
      await api.addNominee(created.id, { name: 'Dune' })

      await expect(
        api.createElection({
          name: 'X',
          closesAt: new Date(start.getTime() + DAY).toISOString(),
          categoryIds: ['actor', created.id],
        }),
      ).rejects.toMatchObject({ status: 400 })
    })

    it('en categorias usadas solo permite editar nombres', async () => {
      const { api } = setup()
      api.setUser('admin')

      const actor = (await api.listCatalog()).find((category) => category.id === 'actor')
      expect(actor).toMatchObject({ locked: true, usedInElections: 1 })

      await expect(api.addNominee('actor', { name: 'a3' })).rejects.toMatchObject({
        status: 409,
      })
      await expect(
        api.updateCategory('actor', { name: 'Mejor actor', votingMethod: 'ranked' }),
      ).rejects.toMatchObject({ status: 409 })
      await expect(api.deleteCategory('actor')).rejects.toMatchObject({ status: 409 })

      const renamed = await api.updateNominee('a1', { name: 'Actor uno' })
      expect(renamed.nominees[0].name).toBe('Actor uno')
      const updated = await api.updateCategory('actor', {
        name: 'Mejor actor protagonico',
        votingMethod: 'plurality',
      })
      expect(updated.name).toBe('Mejor actor protagonico')
    })

    it('en categorias sin uso permite cambiar el metodo y eliminarlas con sus nominados', async () => {
      const { api } = setup()
      api.setUser('admin')
      const created = await api.createCategory({
        name: 'Mejor sonido',
        votingMethod: 'plurality',
      })
      await api.addNominee(created.id, { name: 'Dune' })

      const updated = await api.updateCategory(created.id, {
        name: 'Mejor sonido',
        votingMethod: 'ranked',
      })
      expect(updated.votingMethod).toBe('ranked')

      await api.deleteCategory(created.id)
      expect((await api.listCatalog()).map((category) => category.id)).not.toContain(
        created.id,
      )
      await expect(
        api.updateNominee(updated.nominees[0].id, { name: 'X' }),
      ).rejects.toMatchObject({ status: 404 })
    })

    it('rechaza nombres repetidos', async () => {
      const { api } = setup()
      api.setUser('admin')

      await expect(
        api.createCategory({ name: 'mejor ACTOR', votingMethod: 'plurality' }),
      ).rejects.toMatchObject({ status: 400 })
      await expect(api.updateNominee('a2', { name: 'A1' })).rejects.toMatchObject({
        status: 400,
      })
    })
  })
})

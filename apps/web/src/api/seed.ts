import { categoryId } from '@votacion/voting-core'
import type {
  Answer,
  Category,
  Election,
  ElectionMembership,
  Nominee,
  User,
} from '@votacion/voting-core'

export type SeedData = {
  users: User[]
  categories: Category[]
  nominees: Nominee[]
  elections: Election[]
  memberships: ElectionMembership[]
  // todas las versiones de las respuestas, en orden de guardado
  answerHistory: Answer[]
}

// Catalogo de docs/Categorias Oscar.txt (edicion 2026: incluye la nueva categoria de casting)
export const SEED_YEAR = 2026
const BEST_PICTURE = 'Mejor película'

const categoryNames = [
  'Mejor película',
  'Mejor dirección',
  'Mejor actor',
  'Mejor actriz',
  'Mejor actor de reparto',
  'Mejor actriz de reparto',
  'Mejor guion original',
  'Mejor guion adaptado',
  'Mejor película de animación',
  'Mejor película internacional',
  'Mejor dirección de casting',
  'Mejor documental',
  'Mejor cortometraje documental',
  'Mejor cortometraje de acción real',
  'Mejor cortometraje de animación',
  'Mejor banda sonora original',
  'Mejor canción original',
  'Mejor sonido',
  'Mejor diseño de producción',
  'Mejor fotografía',
  'Mejor maquillaje y peluquería',
  'Mejor diseño de vestuario',
  'Mejor montaje / edición',
  'Mejores efectos visuales',
]

const bestPictureNominees = [
  'The Shawshank Redemption',
  'The Godfather',
  'The Dark Knight',
  'Pulp Fiction',
  'Parasite',
]

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

export function createSeed(now: Date): SeedData {
  const at = (offset: number) => new Date(now.getTime() + offset).toISOString()

  // Ids con nombre y año, igual que los que genera la API: "mejor-pelicula-2026"
  const taken = new Set<string>()
  const categories: Category[] = categoryNames.map((name) => {
    const id = categoryId(name, SEED_YEAR, taken)
    taken.add(id)
    return {
      id,
      name,
      votingMethod: name === BEST_PICTURE ? 'ranked' : 'plurality',
      year: SEED_YEAR,
    }
  })
  const idOf = (name: string): string => {
    const category = categories.find((candidate) => candidate.name === name)
    if (!category) {
      throw new Error(`Categoria desconocida en el seed: ${name}`)
    }
    return category.id
  }
  const picture = idOf(BEST_PICTURE)
  const director = idOf('Mejor dirección')
  const actor = idOf('Mejor actor')

  const nominees: Nominee[] = categories.flatMap((category) =>
    category.id === picture
      ? bestPictureNominees.map((name, index) => ({
          id: `${category.id}-${index + 1}`,
          categoryId: category.id,
          name,
        }))
      : Array.from({ length: 5 }, (_, index) => ({
          id: `${category.id}-${index + 1}`,
          categoryId: category.id,
          name: `Nominado ${index + 1}`,
        })),
  )

  const users: User[] = [
    { id: 'u-alice', displayName: 'Alice (admin)', role: 'admin' },
    { id: 'u-bob', displayName: 'Bob', role: 'voter' },
    { id: 'u-carla', displayName: 'Carla', role: 'voter' },
    { id: 'u-diego', displayName: 'Diego', role: 'voter' },
  ]

  const elections: Election[] = [
    {
      id: 'e-oficina',
      code: 'OFIC2027',
      name: 'Oscar en la oficina',
      closesAt: at(14 * DAY),
      categoryIds: categories.slice(0, 8).map((category) => category.id),
      adminIds: ['u-alice'],
      createdAt: at(-5 * DAY),
    },
    {
      id: 'e-familia',
      code: 'FAMILIA7',
      name: 'Familia',
      closesAt: at(3 * DAY),
      categoryIds: [
        picture,
        actor,
        idOf('Mejor actriz'),
        idOf('Mejor película de animación'),
      ],
      adminIds: ['u-alice'],
      createdAt: at(-5 * DAY),
    },
    {
      id: 'e-cerrada',
      code: 'PREVIA26',
      name: 'Votación previa',
      closesAt: at(-1 * DAY),
      categoryIds: [picture, director, actor],
      adminIds: ['u-alice'],
      createdAt: at(-10 * DAY),
    },
  ]

  const join = (electionId: string, userIds: string[]): ElectionMembership[] =>
    userIds.map((userId) => ({ electionId, userId, joinedAt: at(-4 * DAY) }))

  const memberships = [
    ...join('e-oficina', ['u-bob', 'u-carla', 'u-alice']),
    ...join('e-familia', ['u-bob', 'u-diego']),
    ...join('e-cerrada', ['u-bob', 'u-carla', 'u-diego']),
  ]

  const ranking = (order: number[]) => order.map((n) => `${picture}-${n}`)
  const answer = (
    userId: string,
    categoryId: string,
    offset: number,
    choice: { nomineeId: string } | { ranking: string[] },
  ): Answer => ({ userId, categoryId, updatedAt: at(offset), ...choice })

  const answerHistory: Answer[] = [
    answer('u-bob', picture, -3 * DAY, { ranking: ranking([2, 1, 3, 4, 5]) }),
    answer('u-bob', actor, -3 * DAY, { nomineeId: `${actor}-2` }),
    answer('u-carla', picture, -3 * DAY, { ranking: ranking([1, 2, 5, 3, 4]) }),
    answer('u-carla', director, -3 * DAY, { nomineeId: `${director}-1` }),
    answer('u-carla', actor, -3 * DAY, { nomineeId: `${actor}-2` }),
    answer('u-diego', picture, -2 * DAY, { ranking: ranking([5, 1, 2, 3, 4]) }),
    answer('u-diego', actor, -2 * DAY, { nomineeId: `${actor}-4` }),
    // Bob cambio su ranking despues del cierre de PREVIA26: esa votacion conserva el anterior
    answer('u-bob', picture, -2 * HOUR, { ranking: ranking([3, 2, 1, 4, 5]) }),
  ]

  return { users, categories, nominees, elections, memberships, answerHistory }
}

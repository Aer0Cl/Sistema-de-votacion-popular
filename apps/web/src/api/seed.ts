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

// Catalogo de docs/Categorias Oscar.txt
const categoryNames: [string, string][] = [
  ['mejor-pelicula', 'Mejor película'],
  ['mejor-direccion', 'Mejor dirección'],
  ['mejor-actor', 'Mejor actor'],
  ['mejor-actriz', 'Mejor actriz'],
  ['mejor-actor-reparto', 'Mejor actor de reparto'],
  ['mejor-actriz-reparto', 'Mejor actriz de reparto'],
  ['mejor-guion-original', 'Mejor guion original'],
  ['mejor-guion-adaptado', 'Mejor guion adaptado'],
  ['mejor-pelicula-animacion', 'Mejor película de animación'],
  ['mejor-pelicula-internacional', 'Mejor película internacional'],
  ['mejor-casting', 'Mejor dirección de casting'],
  ['mejor-documental', 'Mejor documental'],
  ['mejor-corto-documental', 'Mejor cortometraje documental'],
  ['mejor-corto-accion-real', 'Mejor cortometraje de acción real'],
  ['mejor-corto-animacion', 'Mejor cortometraje de animación'],
  ['mejor-banda-sonora', 'Mejor banda sonora original'],
  ['mejor-cancion', 'Mejor canción original'],
  ['mejor-sonido', 'Mejor sonido'],
  ['mejor-diseno-produccion', 'Mejor diseño de producción'],
  ['mejor-fotografia', 'Mejor fotografía'],
  ['mejor-maquillaje', 'Mejor maquillaje y peluquería'],
  ['mejor-vestuario', 'Mejor diseño de vestuario'],
  ['mejor-montaje', 'Mejor montaje / edición'],
  ['mejores-efectos-visuales', 'Mejores efectos visuales'],
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

  const categories: Category[] = categoryNames.map(([id, name]) => ({
    id,
    name,
    votingMethod: id === 'mejor-pelicula' ? 'ranked' : 'plurality',
  }))

  const nominees: Nominee[] = categories.flatMap((category) =>
    category.id === 'mejor-pelicula'
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
        'mejor-pelicula',
        'mejor-actor',
        'mejor-actriz',
        'mejor-pelicula-animacion',
      ],
      adminIds: ['u-alice'],
      createdAt: at(-5 * DAY),
    },
    {
      id: 'e-cerrada',
      code: 'PREVIA26',
      name: 'Votación previa',
      closesAt: at(-1 * DAY),
      categoryIds: ['mejor-pelicula', 'mejor-direccion', 'mejor-actor'],
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

  const picture = (order: number[]) => order.map((n) => `mejor-pelicula-${n}`)
  const answer = (
    userId: string,
    categoryId: string,
    offset: number,
    choice: { nomineeId: string } | { ranking: string[] },
  ): Answer => ({ userId, categoryId, updatedAt: at(offset), ...choice })

  const answerHistory: Answer[] = [
    answer('u-bob', 'mejor-pelicula', -3 * DAY, { ranking: picture([2, 1, 3, 4, 5]) }),
    answer('u-bob', 'mejor-actor', -3 * DAY, { nomineeId: 'mejor-actor-2' }),
    answer('u-carla', 'mejor-pelicula', -3 * DAY, { ranking: picture([1, 2, 5, 3, 4]) }),
    answer('u-carla', 'mejor-direccion', -3 * DAY, { nomineeId: 'mejor-direccion-1' }),
    answer('u-carla', 'mejor-actor', -3 * DAY, { nomineeId: 'mejor-actor-2' }),
    answer('u-diego', 'mejor-pelicula', -2 * DAY, { ranking: picture([5, 1, 2, 3, 4]) }),
    answer('u-diego', 'mejor-actor', -2 * DAY, { nomineeId: 'mejor-actor-4' }),
    // Bob cambio su ranking despues del cierre de PREVIA26: esa votacion conserva el anterior
    answer('u-bob', 'mejor-pelicula', -2 * HOUR, { ranking: picture([3, 2, 1, 4, 5]) }),
  ]

  return { users, categories, nominees, elections, memberships, answerHistory }
}

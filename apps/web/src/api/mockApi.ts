import {
  getElectionStatus,
  normalizeElectionCode,
  snapshotAnswers,
  tallyElection,
  validateAnswerChoice,
  validateNewElection,
} from '@votacion/voting-core'
import type {
  Answer,
  AnswerChoice,
  Election,
  ElectionSnapshot,
  NewElectionInput,
} from '@votacion/voting-core'
import type { SeedData } from './seed'
import { ApiError } from './types'
import type { CategoryWithNominees, ElectionSummary, VotingApi } from './types'

type MockApiOptions = {
  seed: SeedData
  userId: string
  now?: () => Date
  // latencia simulada por llamada
  delayMs?: number
}

export type MockVotingApi = VotingApi & {
  setUser(userId: string): void
  listUsers(): Promise<SeedData['users']>
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

// JSON y no structuredClone: los argumentos pueden venir como proxies reactivos de Vue
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

/**
 * Backend simulado en memoria con las mismas reglas que tendra la API real.
 * Las votaciones cerradas se fotografian al primer acceso despues del cierre, como lo
 * haria un proceso programado; la foto solo usa respuestas anteriores a la fecha de termino.
 */
export function createMockApi(options: MockApiOptions): MockVotingApi {
  const state = clone(options.seed)
  const snapshots = new Map<string, ElectionSnapshot>()
  const now = options.now ?? (() => new Date())
  const delayMs = options.delayMs ?? 0
  let userId = options.userId

  async function respond<T>(handler: () => T): Promise<T> {
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
    takePendingSnapshots()
    return clone(handler())
  }

  function takePendingSnapshots() {
    for (const election of state.elections) {
      if (status(election) === 'closed' && !snapshots.has(election.id)) {
        snapshots.set(election.id, {
          electionId: election.id,
          takenAt: now().toISOString(),
          answers: snapshotAnswers(state.answerHistory, election, memberIds(election)),
        })
      }
    }
  }

  function me() {
    const user = state.users.find((candidate) => candidate.id === userId)
    if (!user) {
      throw new ApiError(401, 'Debes iniciar sesion.')
    }
    return user
  }

  function status(election: Election) {
    return getElectionStatus(election, now())
  }

  function memberIds(election: Election) {
    return state.memberships
      .filter((membership) => membership.electionId === election.id)
      .map((membership) => membership.userId)
  }

  function isMember(election: Election) {
    return memberIds(election).includes(userId)
  }

  function isAdmin(election: Election) {
    return election.adminIds.includes(userId)
  }

  function findElection(code: string) {
    const normalized = normalizeElectionCode(code)
    const election = state.elections.find((candidate) => candidate.code === normalized)
    if (!election) {
      throw new ApiError(404, 'No existe una votacion con ese identificador.')
    }
    return election
  }

  function summary(election: Election): ElectionSummary {
    return {
      code: election.code,
      name: election.name,
      closesAt: election.closesAt,
      status: status(election),
      categoryIds: election.categoryIds,
      memberCount: memberIds(election).length,
      isMember: isMember(election),
      isAdmin: isAdmin(election),
    }
  }

  function categoriesWithNominees(categoryIds: string[]): CategoryWithNominees[] {
    return categoryIds.flatMap((id) => {
      const category = state.categories.find((candidate) => candidate.id === id)
      if (!category) {
        return []
      }
      const nominees = state.nominees.filter((nominee) => nominee.categoryId === id)
      return [{ ...category, nominees }]
    })
  }

  // Ultima version de cada respuesta del usuario
  function currentAnswers(forUserId: string): Answer[] {
    const latest = new Map<string, Answer>()
    for (const answer of state.answerHistory) {
      if (answer.userId !== forUserId) {
        continue
      }
      const current = latest.get(answer.categoryId)
      if (!current || current.updatedAt <= answer.updatedAt) {
        latest.set(answer.categoryId, answer)
      }
    }
    return [...latest.values()]
  }

  function generateCode() {
    for (;;) {
      const code = Array.from(
        { length: 8 },
        () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)],
      ).join('')
      if (!state.elections.some((election) => election.code === code)) {
        return code
      }
    }
  }

  return {
    setUser(id) {
      userId = id
    },

    listUsers: () => respond(() => state.users),

    getMe: () => respond(me),

    listMyElections: () =>
      respond(() => {
        me()
        return state.elections
          .filter((election) => isMember(election) || isAdmin(election))
          .map(summary)
          .sort((a, b) =>
            a.status === b.status
              ? a.closesAt.localeCompare(b.closesAt)
              : a.status === 'open'
                ? -1
                : 1,
          )
      }),

    previewElection: (code) =>
      respond(() => {
        me()
        const election = findElection(code)
        return {
          code: election.code,
          name: election.name,
          closesAt: election.closesAt,
          status: status(election),
          categoryCount: election.categoryIds.length,
        }
      }),

    joinElection: (code) =>
      respond(() => {
        me()
        const election = findElection(code)
        if (isMember(election)) {
          return summary(election)
        }
        if (status(election) === 'closed') {
          throw new ApiError(409, 'La votacion ya cerro; no se puede unir.')
        }
        state.memberships.push({
          electionId: election.id,
          userId,
          joinedAt: now().toISOString(),
        })
        return summary(election)
      }),

    getElection: (code) =>
      respond(() => {
        me()
        const election = findElection(code)
        if (!isMember(election) && !isAdmin(election)) {
          throw new ApiError(403, 'Debes unirte a la votacion para verla.')
        }

        const inElection = (answer: Answer) =>
          answer.userId === userId && election.categoryIds.includes(answer.categoryId)
        const myAnswers =
          status(election) === 'closed'
            ? (snapshots.get(election.id)?.answers ?? []).filter(inElection)
            : currentAnswers(userId).filter(inElection)

        return {
          ...summary(election),
          categories: categoriesWithNominees(election.categoryIds),
          myAnswers,
        }
      }),

    listCategories: () =>
      respond(() => {
        me()
        return state.categories
      }),

    createElection: (input: NewElectionInput) =>
      respond(() => {
        if (me().role !== 'admin') {
          throw new ApiError(403, 'Solo los administradores pueden crear votaciones.')
        }
        const errors = validateNewElection(input, state.categories, now())
        if (errors.length > 0) {
          throw new ApiError(400, errors.join(' '))
        }

        const election: Election = {
          id: `e-${state.elections.length + 1}-${Date.now()}`,
          code: generateCode(),
          name: input.name.trim(),
          closesAt: new Date(input.closesAt).toISOString(),
          categoryIds: [...new Set(input.categoryIds)],
          adminIds: [userId],
          createdAt: now().toISOString(),
        }
        state.elections.push(election)
        return summary(election)
      }),

    getMyAnswers: () =>
      respond(() => {
        me()
        return currentAnswers(userId)
      }),

    saveAnswer: (categoryId, choice: AnswerChoice) =>
      respond(() => {
        me()
        const category = state.categories.find((candidate) => candidate.id === categoryId)
        if (!category) {
          throw new ApiError(404, 'La categoria no existe.')
        }

        const error = validateAnswerChoice(category, state.nominees, choice)
        if (error) {
          throw new ApiError(400, error)
        }

        const usedInOpenElection = state.elections.some(
          (election) =>
            status(election) === 'open' &&
            isMember(election) &&
            election.categoryIds.includes(categoryId),
        )
        if (!usedInOpenElection) {
          throw new ApiError(
            403,
            'No participas en ninguna votacion abierta que incluya esta categoria.',
          )
        }

        const answer: Answer = {
          ...('nomineeId' in choice
            ? { nomineeId: choice.nomineeId }
            : { ranking: [...choice.ranking] }),
          userId,
          categoryId,
          updatedAt: now().toISOString(),
        }
        state.answerHistory.push(answer)
        return answer
      }),

    getResults: (code) =>
      respond(() => {
        me()
        const election = findElection(code)
        if (!isAdmin(election)) {
          throw new ApiError(
            403,
            'Solo los administradores de la votacion pueden ver los resultados.',
          )
        }

        const snapshot = snapshots.get(election.id)
        const members = memberIds(election)
        const answers = snapshot
          ? snapshot.answers
          : members.flatMap((member) =>
              currentAnswers(member).filter((answer) =>
                election.categoryIds.includes(answer.categoryId),
              ),
            )
        const categories = categoriesWithNominees(election.categoryIds)

        return {
          code: election.code,
          name: election.name,
          status: status(election),
          closesAt: election.closesAt,
          memberCount: members.length,
          snapshotTakenAt: snapshot?.takenAt,
          categories,
          results: tallyElection(
            categories,
            categories.flatMap((category) => category.nominees),
            answers,
          ),
        }
      }),
  }
}

// Como se decidio a quien eliminar cuando varios empataron en el ultimo lugar
export type TieBreakRule = 'previous-rounds' | 'total-mentions' | 'id-order'

export type RunoffRound = {
  round: number
  // votos de cada nominado que sigue en carrera
  tally: Record<string, number>
  // papeletas que cuentan para algun nominado en esta ronda
  activeBallots: number
  // papeletas sin preferencias restantes
  exhaustedBallots: number
  eliminated: string[]
  tieBreak?: TieBreakRule
}

export type RunoffResult = {
  totalBallots: number
  // mas de un ganador significa empate final
  winners: string[]
  rounds: RunoffRound[]
}

/**
 * Segunda vuelta instantanea: en cada ronda cada papeleta cuenta para su preferencia
 * mas alta que siga en carrera. Gana quien supere el 50% de las papeletas activas; si
 * nadie lo logra, se elimina al de menos votos y se repite.
 *
 * Desempate para el ultimo lugar, en orden:
 * 1. menos votos en la ronda anterior (y asi hacia atras),
 * 2. menos menciones totales en cualquier posicion,
 * 3. el id mayor en orden alfabetico.
 * Si todos los que quedan estan empatados, se declaran co-ganadores.
 */
export function tallyInstantRunoff(
  nominees: readonly string[],
  ballots: readonly { ranking: readonly string[] }[],
): RunoffResult {
  const candidates = new Set(nominees)
  // Copia de cada papeleta sin nominados desconocidos ni repetidos; las originales no se tocan
  const preferences = ballots.map((ballot) => [
    ...new Set(ballot.ranking.filter((nominee) => candidates.has(nominee))),
  ])

  const remaining = new Set(candidates)
  const rounds: RunoffRound[] = []
  let winners: string[] = []

  while (remaining.size > 0) {
    const tally: Record<string, number> = {}
    for (const nominee of remaining) {
      tally[nominee] = 0
    }

    let exhaustedBallots = 0
    for (const ranking of preferences) {
      const choice = ranking.find((nominee) => remaining.has(nominee))
      if (choice === undefined) {
        exhaustedBallots += 1
      } else {
        tally[choice] += 1
      }
    }

    const activeBallots = preferences.length - exhaustedBallots
    const round: RunoffRound = {
      round: rounds.length + 1,
      tally,
      activeBallots,
      exhaustedBallots,
      eliminated: [],
    }
    rounds.push(round)

    if (activeBallots === 0) {
      break
    }

    const votes = Object.values(tally)
    const maxVotes = Math.max(...votes)
    const minVotes = Math.min(...votes)

    if (maxVotes * 2 > activeBallots) {
      winners = [...remaining].filter((nominee) => tally[nominee] === maxVotes)
      break
    }

    if (maxVotes === minVotes) {
      winners = [...remaining]
      break
    }

    const lowest = [...remaining].filter((nominee) => tally[nominee] === minVotes)
    const { eliminated, tieBreak } = breakTieForLast(lowest, rounds, preferences)

    round.eliminated = [eliminated]
    if (tieBreak) {
      round.tieBreak = tieBreak
    }
    remaining.delete(eliminated)
  }

  return { totalBallots: ballots.length, winners, rounds }
}

function breakTieForLast(
  tied: string[],
  rounds: readonly RunoffRound[],
  preferences: readonly string[][],
): { eliminated: string; tieBreak?: TieBreakRule } {
  if (tied.length === 1) {
    return { eliminated: tied[0] }
  }

  let pending = tied

  // La ronda actual es la ultima; se compara desde la anterior hacia atras
  for (let index = rounds.length - 2; index >= 0 && pending.length > 1; index -= 1) {
    pending = keepLowest(pending, (nominee) => rounds[index].tally[nominee] ?? 0)
  }
  if (pending.length === 1) {
    return { eliminated: pending[0], tieBreak: 'previous-rounds' }
  }

  pending = keepLowest(
    pending,
    (nominee) => preferences.filter((ranking) => ranking.includes(nominee)).length,
  )
  if (pending.length === 1) {
    return { eliminated: pending[0], tieBreak: 'total-mentions' }
  }

  const [eliminated] = [...pending].sort().reverse()
  return { eliminated, tieBreak: 'id-order' }
}

function keepLowest(nominees: string[], score: (nominee: string) => number): string[] {
  const min = Math.min(...nominees.map(score))
  return nominees.filter((nominee) => score(nominee) === min)
}

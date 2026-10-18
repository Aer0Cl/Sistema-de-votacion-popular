export type PluralityResult = {
  totalBallots: number
  // papeletas cuyo nominado no pertenece a la categoria
  invalidBallots: number
  // votos por nominado, incluidos los que tienen 0
  tally: Record<string, number>
  // mas de un ganador significa empate en el primer lugar
  winners: string[]
}

export function tallyPlurality(
  nominees: readonly string[],
  ballots: readonly { nomineeId: string }[],
): PluralityResult {
  const candidates = new Set(nominees)
  const tally: Record<string, number> = {}
  for (const nominee of candidates) {
    tally[nominee] = 0
  }

  let invalidBallots = 0
  for (const ballot of ballots) {
    if (candidates.has(ballot.nomineeId)) {
      tally[ballot.nomineeId] += 1
    } else {
      invalidBallots += 1
    }
  }

  const maxVotes = Math.max(0, ...Object.values(tally))
  const winners =
    maxVotes === 0
      ? []
      : Object.keys(tally).filter((nominee) => tally[nominee] === maxVotes)

  return { totalBallots: ballots.length, invalidBallots, tally, winners }
}

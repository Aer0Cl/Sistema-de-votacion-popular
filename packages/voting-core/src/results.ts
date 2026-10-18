import { tallyInstantRunoff } from './instantRunoff'
import type { RunoffResult } from './instantRunoff'
import { tallyPlurality } from './plurality'
import type { PluralityResult } from './plurality'
import type { Answer, Category, Nominee } from './types'

export type CategoryResult =
  | { categoryId: string; votingMethod: 'plurality'; result: PluralityResult }
  | { categoryId: string; votingMethod: 'ranked'; result: RunoffResult }

// Resultado de cada categoria a partir de las respuestas (normalmente, una foto de cierre)
export function tallyElection(
  categories: readonly Category[],
  nominees: readonly Nominee[],
  answers: readonly Answer[],
): CategoryResult[] {
  return categories.map((category) => {
    const nomineeIds = nominees
      .filter((nominee) => nominee.categoryId === category.id)
      .map((nominee) => nominee.id)
    const categoryAnswers = answers.filter((answer) => answer.categoryId === category.id)

    if (category.votingMethod === 'plurality') {
      const ballots = categoryAnswers.flatMap((answer) =>
        'nomineeId' in answer ? [{ nomineeId: answer.nomineeId }] : [],
      )
      return {
        categoryId: category.id,
        votingMethod: 'plurality',
        result: tallyPlurality(nomineeIds, ballots),
      }
    }

    const ballots = categoryAnswers.flatMap((answer) =>
      'ranking' in answer ? [{ ranking: answer.ranking }] : [],
    )
    return {
      categoryId: category.id,
      votingMethod: 'ranked',
      result: tallyInstantRunoff(nomineeIds, ballots),
    }
  })
}

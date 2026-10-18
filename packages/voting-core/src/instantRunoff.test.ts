import { describe, expect, it } from 'vitest'
import { tallyInstantRunoff } from './instantRunoff'

function ballots(...rankings: string[]) {
  return rankings.map((ranking) => ({ ranking: ranking.split('') }))
}

function repeat(times: number, ranking: string) {
  return Array.from({ length: times }, () => ranking)
}

describe('tallyInstantRunoff', () => {
  it('gana en la primera ronda con mayoria absoluta', () => {
    const result = tallyInstantRunoff(['a', 'b', 'c'], ballots('abc', 'acb', 'bac'))

    expect(result.winners).toEqual(['a'])
    expect(result.rounds).toHaveLength(1)
    expect(result.rounds[0]).toMatchObject({
      tally: { a: 2, b: 1, c: 0 },
      activeBallots: 3,
      eliminated: [],
    })
  })

  it('transfiere los votos del eliminado a la siguiente preferencia', () => {
    // a: 4, b: 3, c: 2 -> se elimina c y sus votos pasan a b
    const result = tallyInstantRunoff(
      ['a', 'b', 'c'],
      ballots(...repeat(4, 'abc'), ...repeat(3, 'bac'), ...repeat(2, 'cba')),
    )

    expect(result.winners).toEqual(['b'])
    expect(result.rounds.map((round) => round.tally)).toEqual([
      { a: 4, b: 3, c: 2 },
      { a: 4, b: 5 },
    ])
    expect(result.rounds[0].eliminated).toEqual(['c'])
  })

  it('salta a preferencias ya eliminadas en rondas anteriores', () => {
    // Ronda 1 elimina d; ronda 2 elimina c, cuyas papeletas tienen a d como segunda opcion
    const result = tallyInstantRunoff(
      ['a', 'b', 'c', 'd'],
      ballots(...repeat(4, 'abcd'), ...repeat(3, 'bacd'), ...repeat(2, 'cdba'), 'dcba'),
    )

    expect(result.rounds.map((round) => round.eliminated)).toEqual([['d'], ['c'], []])
    expect(result.rounds[2].tally).toEqual({ a: 4, b: 6 })
    expect(result.winners).toEqual(['b'])
  })

  it('calcula la mayoria sobre las papeletas activas, no sobre el total', () => {
    // Las papeletas 'c' se agotan al eliminar c: quedan 5 activas y a gana con 3
    const result = tallyInstantRunoff(
      ['a', 'b', 'c'],
      ballots('a', 'a', 'a', 'b', 'b', 'c', 'c'),
    )

    expect(result.winners).toEqual(['a'])
    expect(result.rounds[1]).toMatchObject({
      tally: { a: 3, b: 2 },
      activeBallots: 5,
      exhaustedBallots: 2,
    })
  })

  it('no modifica las papeletas recibidas', () => {
    const input = ballots('abc', 'bca', 'cab', 'cba')
    const snapshot = structuredClone(input)

    tallyInstantRunoff(['a', 'b', 'c'], input)

    expect(input).toEqual(snapshot)
  })

  it('termina aunque un nominado no tenga votos de primera preferencia', () => {
    // Caso que dejaba en bucle infinito a la version anterior en useRanking
    const result = tallyInstantRunoff(
      ['a', 'b', 'c', 'd'],
      ballots('abcd', 'bacd', 'cabd', 'abdc', 'bcad'),
    )

    expect(result.winners).toHaveLength(1)
    expect(result.rounds[0].eliminated).toEqual(['d'])
  })

  it('desempata el ultimo lugar por votos en la ronda anterior', () => {
    const result = tallyInstantRunoff(
      ['a', 'b', 'c', 'd', 'e'],
      ballots('a', 'a', 'a', 'b', 'b', 'c', 'c', 'c', 'dc', 'eb'),
    )

    // Ronda 1: a 3, b 2, c 3, d 1, e 1 -> d y e empatan (sin rondas previas, 1 mencion cada uno)
    expect(result.rounds[0]).toMatchObject({ eliminated: ['e'], tieBreak: 'id-order' })
    // Ronda 2: a 3, b 3, c 3, d 1 -> se elimina d
    expect(result.rounds[1].eliminated).toEqual(['d'])
    // Ronda 3: a 3, b 3, c 4 -> a y b empatan; en la ronda 2 ambos tenian 3, en la 1 b tenia 2
    expect(result.rounds[2]).toMatchObject({
      tally: { a: 3, b: 3, c: 4 },
      eliminated: ['b'],
      tieBreak: 'previous-rounds',
    })
  })

  it('desempata por menciones totales si las rondas previas no alcanzan', () => {
    // a 2, b 1, c 1 y no hay rondas previas; c aparece en mas papeletas que b
    const result = tallyInstantRunoff(['a', 'b', 'c'], ballots('ac', 'ac', 'b', 'c'))

    expect(result.rounds[0]).toMatchObject({
      eliminated: ['b'],
      tieBreak: 'total-mentions',
    })
  })

  it('declara co-ganadores si los que quedan estan empatados', () => {
    const result = tallyInstantRunoff(['a', 'b'], ballots('ab', 'ba'))

    expect(result.winners).toEqual(['a', 'b'])
    expect(result.rounds).toHaveLength(1)
  })

  it('acepta rankings parciales y los cuenta como agotados al quedarse sin opciones', () => {
    const result = tallyInstantRunoff(['a', 'b', 'c'], ballots('a', 'a', 'b', 'b', 'c'))

    expect(result.rounds[0].eliminated).toEqual(['c'])
    expect(result.rounds[1]).toMatchObject({ exhaustedBallots: 1, activeBallots: 4 })
    expect(result.winners).toEqual(['a', 'b'])
  })

  it('no tiene ganador sin papeletas', () => {
    const result = tallyInstantRunoff(['a', 'b'], [])

    expect(result.winners).toEqual([])
    expect(result.totalBallots).toBe(0)
    expect(result.rounds).toHaveLength(1)
  })

  it('una sola papeleta decide el resultado', () => {
    const result = tallyInstantRunoff(['a', 'b', 'c'], ballots('cab'))

    expect(result.winners).toEqual(['c'])
  })

  it('ignora nominados desconocidos y repetidos dentro de una papeleta', () => {
    const result = tallyInstantRunoff(['a', 'b'], [{ ranking: ['x', 'b', 'b', 'a'] }])

    expect(result.rounds[0].tally).toEqual({ a: 0, b: 1 })
    expect(result.winners).toEqual(['b'])
  })

  it('no tiene ganador sin nominados', () => {
    const result = tallyInstantRunoff([], ballots('ab'))

    expect(result.winners).toEqual([])
    expect(result.rounds).toEqual([])
  })
})

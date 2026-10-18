import { describe, expect, it } from 'vitest'
import { tallyPlurality } from './plurality'

const nominees = ['a', 'b', 'c']

function votes(...ids: string[]) {
  return ids.map((nomineeId) => ({ nomineeId }))
}

describe('tallyPlurality', () => {
  it('elige al nominado con mas votos', () => {
    const result = tallyPlurality(nominees, votes('a', 'b', 'b', 'c', 'b'))

    expect(result.winners).toEqual(['b'])
    expect(result.tally).toEqual({ a: 1, b: 3, c: 1 })
    expect(result.totalBallots).toBe(5)
  })

  it('no necesita mayoria absoluta', () => {
    const result = tallyPlurality(nominees, votes('a', 'a', 'b', 'c'))

    expect(result.winners).toEqual(['a'])
  })

  it('declara co-ganadores si hay empate en el primer lugar', () => {
    const result = tallyPlurality(nominees, votes('a', 'b', 'a', 'b', 'c'))

    expect(result.winners).toEqual(['a', 'b'])
  })

  it('incluye a los nominados sin votos en el conteo', () => {
    const result = tallyPlurality(nominees, votes('a'))

    expect(result.tally).toEqual({ a: 1, b: 0, c: 0 })
  })

  it('no tiene ganador sin papeletas', () => {
    const result = tallyPlurality(nominees, [])

    expect(result.winners).toEqual([])
    expect(result.totalBallots).toBe(0)
  })

  it('separa las papeletas de nominados que no pertenecen a la categoria', () => {
    const result = tallyPlurality(nominees, votes('a', 'zzz', 'constructor'))

    expect(result.winners).toEqual(['a'])
    expect(result.invalidBallots).toBe(2)
    expect(result.tally).toEqual({ a: 1, b: 0, c: 0 })
  })
})

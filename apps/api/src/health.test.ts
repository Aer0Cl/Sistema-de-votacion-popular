import { describe, expect, it } from 'vitest'
import { healthHandler } from './health'

describe('healthHandler', () => {
  it('responde 200 con status ok', async () => {
    const response = await healthHandler()

    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.body)).toEqual({ status: 'ok' })
  })
})

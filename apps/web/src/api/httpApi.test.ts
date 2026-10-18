import { afterEach, describe, expect, it, vi } from 'vitest'
import { createHttpApi } from './httpApi'
import { ApiError } from './types'

function mockFetch(status: number, body?: unknown) {
  const fetchMock = vi.fn<typeof fetch>(async () =>
    body === undefined
      ? new Response(null, { status })
      : new Response(JSON.stringify(body), {
          status,
          headers: { 'content-type': 'application/json' },
        }),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('httpApi', () => {
  it('envia metodo, ruta, cuerpo y usuario', async () => {
    const fetchMock = mockFetch(200, { categoryId: 'actor' })
    const api = createHttpApi('https://api.test/api/v1/', 'u-bob')

    await api.saveAnswer('mejor actor', { nomineeId: 'n1' })

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.test/api/v1/me/answers/mejor%20actor',
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json', 'x-user-id': 'u-bob' },
        body: JSON.stringify({ nomineeId: 'n1' }),
      },
    )
  })

  it('cambia el usuario de prueba', async () => {
    const fetchMock = mockFetch(200, { id: 'u-alice' })
    const api = createHttpApi('https://api.test/api/v1', 'u-bob')

    api.setUser('u-alice')
    await api.getMe()

    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      headers: { 'x-user-id': 'u-alice' },
    })
  })

  it('convierte las respuestas de error en ApiError con el mensaje del backend', async () => {
    mockFetch(403, { message: 'Solo los administradores pueden crear votaciones.' })
    const api = createHttpApi('https://api.test/api/v1', 'u-bob')

    const error = await api
      .createElection({ name: 'X', closesAt: '', categoryIds: [] })
      .catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({
      status: 403,
      message: 'Solo los administradores pueden crear votaciones.',
    })
  })

  it('acepta respuestas 204 sin cuerpo', async () => {
    mockFetch(204)
    const api = createHttpApi('https://api.test/api/v1', 'u-alice')

    await expect(api.deleteCategory('mejor-sonido-2027')).resolves.toBeUndefined()
  })
})

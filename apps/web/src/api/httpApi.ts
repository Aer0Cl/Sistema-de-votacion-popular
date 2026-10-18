import { ApiError } from './types'
import type { DevVotingApi } from './types'

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

/**
 * Cliente del backend (apps/api). baseUrl es la salida ApiUrl del stack de CDK,
 * terminada en /api/v1. Mientras no exista Cognito el usuario viaja en X-User-Id,
 * que el backend solo acepta en el stage dev.
 */
export function createHttpApi(baseUrl: string, initialUserId: string): DevVotingApi {
  const root = baseUrl.replace(/\/+$/, '')
  let userId = initialUserId

  async function request<T>(
    method: HttpMethod,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const response = await fetch(`${root}${path}`, {
      method,
      headers: { 'content-type': 'application/json', 'x-user-id': userId },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    if (response.status === 204) {
      return undefined as T
    }
    const data: unknown = await response.json().catch(() => null)
    if (!response.ok) {
      const message =
        data &&
        typeof data === 'object' &&
        'message' in data &&
        typeof data.message === 'string'
          ? data.message
          : `Error ${response.status} del servidor.`
      throw new ApiError(response.status, message)
    }
    return data as T
  }

  const segment = encodeURIComponent

  return {
    setUser(id) {
      userId = id
    },
    listUsers: () => request('GET', '/dev/users'),
    getMe: () => request('GET', '/me'),
    listMyElections: () => request('GET', '/me/elections'),
    previewElection: (code) => request('GET', `/elections/${segment(code)}/preview`),
    joinElection: (code) => request('POST', `/elections/${segment(code)}/join`),
    getElection: (code) => request('GET', `/elections/${segment(code)}`),
    leaveElection: (code) => request('DELETE', `/elections/${segment(code)}/membership`),
    createElection: (input) => request('POST', '/elections', input),
    listCatalog: () => request('GET', '/admin/catalog'),
    createCategory: (input) => request('POST', '/admin/categories', input),
    updateCategory: (categoryId, input) =>
      request('PATCH', `/admin/categories/${segment(categoryId)}`, input),
    deleteCategory: (categoryId) =>
      request('DELETE', `/admin/categories/${segment(categoryId)}`),
    addNominee: (categoryId, input) =>
      request('POST', `/admin/categories/${segment(categoryId)}/nominees`, input),
    updateNominee: (nomineeId, input) =>
      request('PATCH', `/admin/nominees/${segment(nomineeId)}`, input),
    getMyAnswers: () => request('GET', '/me/answers'),
    saveAnswer: (categoryId, choice) =>
      request('PUT', `/me/answers/${segment(categoryId)}`, choice),
    getResults: (code) => request('GET', `/elections/${segment(code)}/results`),
  }
}

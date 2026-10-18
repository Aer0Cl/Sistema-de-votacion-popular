export type HealthResponse = {
  statusCode: number
  headers: Record<string, string>
  body: string
}

export async function healthHandler(): Promise<HealthResponse> {
  return {
    statusCode: 200,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status: 'ok' }),
  }
}

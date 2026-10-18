const dateTime = new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeStyle: 'short' })

export function formatDateTime(iso: string): string {
  return dateTime.format(new Date(iso))
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Ocurrio un error inesperado.'
}

import type {
  Answer,
  AnswerChoice,
  Category,
  CategoryResult,
  ElectionStatus,
  NewCategoryInput,
  NewElectionInput,
  Nominee,
  NomineeInput,
  User,
} from '@votacion/voting-core'

export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export type ElectionSummary = {
  code: string
  name: string
  closesAt: string
  status: ElectionStatus
  categoryIds: string[]
  memberCount: number
  isMember: boolean
  isAdmin: boolean
}

// Lo que ve alguien que todavia no se une
export type ElectionPreview = Pick<
  ElectionSummary,
  'code' | 'name' | 'closesAt' | 'status'
> & {
  categoryCount: number
}

// El metodo de votacion viene con cada categoria
export type CategoryWithNominees = Category & { nominees: Nominee[] }

// Vista de administracion del catalogo
export type CatalogCategory = CategoryWithNominees & {
  usedInElections: number
  // usada en alguna votacion: no se puede eliminar, cambiar su metodo ni agregar nominados
  locked: boolean
}

export type ElectionDetail = ElectionSummary & {
  categories: CategoryWithNominees[]
  // abierta: mis respuestas actuales; cerrada: las que quedaron en la foto de cierre
  myAnswers: Answer[]
}

export type ElectionResults = Pick<
  ElectionSummary,
  'code' | 'name' | 'status' | 'closesAt' | 'memberCount'
> & {
  // fecha de la foto de cierre; sin ella son resultados parciales
  snapshotTakenAt?: string
  categories: CategoryWithNominees[]
  results: CategoryResult[]
}

export interface VotingApi {
  getMe(): Promise<User>
  listMyElections(): Promise<ElectionSummary[]>
  previewElection(code: string): Promise<ElectionPreview>
  joinElection(code: string): Promise<ElectionSummary>
  getElection(code: string): Promise<ElectionDetail>
  // solo mientras esta abierta; devuelve null si el usuario ya no la ve (no la administra)
  leaveElection(code: string): Promise<ElectionSummary | null>
  // solo administradores
  createElection(input: NewElectionInput): Promise<ElectionSummary>
  // catalogo (solo administradores); cada operacion devuelve la categoria actualizada
  listCatalog(): Promise<CatalogCategory[]>
  createCategory(input: NewCategoryInput): Promise<CatalogCategory>
  // el nombre se puede cambiar siempre; el metodo, solo si la categoria no esta en uso
  updateCategory(categoryId: string, input: NewCategoryInput): Promise<CatalogCategory>
  // solo si la categoria no esta en uso; elimina tambien sus nominados
  deleteCategory(categoryId: string): Promise<void>
  // agregar solo si la categoria no esta en uso; los nominados no se eliminan
  addNominee(categoryId: string, input: NomineeInput): Promise<CatalogCategory>
  updateNominee(nomineeId: string, input: NomineeInput): Promise<CatalogCategory>
  getMyAnswers(): Promise<Answer[]>
  // la respuesta se aplica a todas las votaciones abiertas del usuario con esa categoria
  saveAnswer(categoryId: string, choice: AnswerChoice): Promise<Answer>
  // solo administradores de la votacion
  getResults(code: string): Promise<ElectionResults>
}

import type { Movie } from '@interfaces/movie'
export type User = {
  id: number
  name: string
  rankedMovies: Movie[]
}

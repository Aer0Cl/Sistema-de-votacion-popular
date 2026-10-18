import { defineStore } from 'pinia'
import type { Movie } from '@interfaces/movie'

const defaultMovies: Movie[] = [
  { id: 1, name: 'The Shawshank Redemption', votes: 0 },
  { id: 2, name: 'The Godfather', votes: 0 },
  { id: 3, name: 'The Dark Knight', votes: 0 },
  { id: 4, name: 'Pulp Fiction', votes: 0 },
]

function cloneMovies(movies: Movie[]): Movie[] {
  return movies.map((movie) => ({ ...movie }))
}

export const useMoviesStore = defineStore('movies', {
  state: () => ({
    movies: cloneMovies(defaultMovies),
  }),
  getters: {
    getMovies: (state) => state.movies,
  },
  actions: {
    createMoviesCopy() {
      return cloneMovies(this.movies)
    },
    addMovie(movie: Omit<Movie, 'votes'> & { votes?: number }) {
      this.movies.push({ votes: 0, ...movie })
    },
    removeMovie(movieId: number) {
      this.movies = this.movies.filter((movie) => movie.id !== movieId)
    },
    updateMovie(movieId: number, newName: string) {
      const movie = this.movies.find((movie) => movie.id === movieId)
      if (movie) {
        movie.name = newName
      }
    },
    addVoteMovie(movieId: number) {
      const movie = this.movies.find((movie) => movie.id === movieId)
      if (movie) {
        movie.votes = (movie.votes || 0) + 1
      }
    },
    sortMoviesByVotes() {
      this.movies.sort((a, b) => (b.votes || 0) - (a.votes || 0))
    },
    resetVotes() {
      this.movies.forEach((movie) => {
        movie.votes = 0
      })
    },
    resetMovies() {
      this.movies = cloneMovies(defaultMovies)
    },
  },
})

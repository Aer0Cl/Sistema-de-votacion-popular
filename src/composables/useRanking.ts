import { reactive, watchEffect } from 'vue'
import type { Movie } from '@interfaces/movie'
import { useMoviesStore } from '@stores/movies'
import { useUsersStore } from '@stores/users'

export function useRanking() {
  const userStore = useUsersStore()
  const moviesStore = useMoviesStore()

  const userRankingLocked = reactive<Record<number, boolean>>({})

  watchEffect(() => {
    for (const user of userStore.getUsers) {
      if (user.rankedMovies.length === 0) {
        userStore.updateRanking(user.id, moviesStore.createMoviesCopy())
      }

      if (userRankingLocked[user.id] === undefined) {
        userRankingLocked[user.id] = false
      }
    }
  })

  function getUserMovies(userId: number): Movie[] {
    return userStore.getUserById(userId)?.rankedMovies ?? []
  }

  function isDragEnabled(userId: number): boolean {
    return !userRankingLocked[userId]
  }

  function lockUserRanking(userId: number) {
    userRankingLocked[userId] = true
  }

  function unlockUserRanking(userId: number) {
    userRankingLocked[userId] = false
  }

  function onListChange(updatedList: Movie[]) {
    console.log(
      'Nuevo orden:',
      updatedList.map((movie) => movie.name),
      updatedList.map((movie) => movie.id),
    )
  }

  function finishVoting() {
    // se debe tomar el ranking de cada usuario, recorrer los arreglos obteniendo la primera posicion y contabilizar la cantidad total de votos para esa pelicula
    // si ninguna pelicula logra obtener una mayoria absoluta de votos, se debe eliminar la pelicula con menos cantidad de votos
    // se deben contabilizar nuevamente los votos de aquellos usuarios que hayan dejado la pelicula eliminada en primera posicion, tomando su segunda opcion como voto valido
    // repetir el proceso hasta que una pelicula logre obtener la mayoria absoluta de votos
    while (moviesStore.movies[0].votes! <= userStore.users.length / 2) {
      moviesStore.resetVotes()
      userStore.users.forEach((user) => {
        moviesStore.addVoteMovie(user.rankedMovies[0]?.id)
      })
      moviesStore.sortMoviesByVotes()
      console.log('Votos por pelicula', moviesStore.getMovies)
      const isWinner = moviesStore.movies[0].votes! > userStore.users.length / 2
      const movieToShow = isWinner
        ? moviesStore.movies[0]
        : moviesStore.movies[moviesStore.movies.length - 1]
      console.log('¿Tenemos ganador?', isWinner)
      console.log('Pelicula Ganadora/Eliminada', movieToShow)
      if (!isWinner) {
        console.log('Eliminando pelicula con menos votos', movieToShow)
        userStore.users.forEach((user) => {
          if (user.rankedMovies[0]?.id === movieToShow.id) {
            user.rankedMovies.shift()
          }
        })
      }
    }
    return moviesStore.movies[0]
  }

  return {
    userRankingLocked,
    getUserMovies,
    isDragEnabled,
    lockUserRanking,
    unlockUserRanking,
    onListChange,
    finishVoting,
  }
}

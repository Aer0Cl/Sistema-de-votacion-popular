<script setup lang="ts">
import MovieList from '@components/MovieList.vue'
import { useRanking } from '@/composables/useRanking'
import type { Movie } from '@interfaces/movie'

import { useUsersStore } from '@stores/users'

const userStore = useUsersStore()

const { getUserMovies, onListChange, isDragEnabled, lockUserRanking, finishVoting } =
  useRanking()

function saveRankedMovies(userId: number, rankedMovies: Movie[]) {
  console.log('Ranking guardado para usuario', userId, rankedMovies)

  userStore.updateRanking(userId, rankedMovies)

  lockUserRanking(userId)
}
</script>

<template>
  <main class="app-shell">
    <section class="hero">
      <p class="kicker">Ranking de peliculas</p>
      <h1>Este es el listado de peliculas a ordenar</h1>
      <p class="subtitle">
        En esta sección se muestra un listado de peliculas populares para que el usuario
        pueda ordenarlas en un ranking de preferencia del 1 al 10.
      </p>
    </section>
    <div v-for="user in userStore.getUsers" :key="user.id">
      <MovieList
        :movies="getUserMovies(user.id)"
        :drag-enabled="isDragEnabled(user.id)"
        @update:movies="(value) => userStore.updateRanking(user.id, value)"
        @change="onListChange"
        @save="(value) => saveRankedMovies(user.id, value)"
      />
    </div>
    <div>
      <button style="margin-top: 1rem" @click="() => finishVoting()">
        Terminar votacion
      </button>
    </div>
  </main>
</template>

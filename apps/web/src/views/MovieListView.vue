<script setup lang="ts">
import { ref } from 'vue'
import MovieList from '@components/MovieList.vue'
import { useRanking } from '@/composables/useRanking'
import type { Movie } from '@interfaces/movie'
import { useUsersStore } from '@stores/users'

const userStore = useUsersStore()
const winnerMovie = ref<Movie | null>(null)

const { getUserMovies, onListChange, isDragEnabled, lockUserRanking, finishVoting } =
  useRanking()

function saveRankedMovies(userId: number, rankedMovies: Movie[]) {
  console.log('Ranking guardado para usuario', userId, rankedMovies)

  userStore.updateRanking(userId, rankedMovies)

  lockUserRanking(userId)
}

function handleFinishVoting() {
  const winner = finishVoting()
  winnerMovie.value = winner
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
      <button style="margin-top: 1rem" @click="handleFinishVoting()">
        Terminar votacion
      </button>
    </div>

    <section v-if="winnerMovie" class="hero" style="margin-top: 2rem;">
      <p class="kicker">Resultado de la votación</p>
      <div class="card" style="padding: 1.5rem; border: 1px solid #ccc; border-radius: 12px; background: #fff; max-width: 520px;">
        <h2>Película seleccionada por mayoría</h2>
        <p><strong>Nombre:</strong> {{ winnerMovie.name }}</p>
        <p v-if="winnerMovie.description"><strong>Descripción:</strong> {{ winnerMovie.description }}</p>
        <p v-if="winnerMovie.releaseDate"><strong>Año / Fecha:</strong> {{ winnerMovie.releaseDate }}</p>
        <p v-if="winnerMovie.votes !== undefined"><strong>Votos obtenidos:</strong> {{ winnerMovie.votes }}</p>
      </div>
    </section>
  </main>
</template>

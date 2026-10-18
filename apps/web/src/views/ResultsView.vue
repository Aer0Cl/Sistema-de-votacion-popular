<script setup lang="ts">
import { ref, watch } from 'vue'
import { api } from '@/api'
import type { CategoryWithNominees, ElectionResults } from '@/api'
import { errorMessage, formatDateTime } from '@/utils/format'

const props = defineProps<{ code: string }>()

const data = ref<ElectionResults | null>(null)
const loadError = ref('')

async function load() {
  loadError.value = ''
  data.value = null
  try {
    data.value = await api.getResults(props.code)
  } catch (error) {
    loadError.value = errorMessage(error)
  }
}

watch(() => props.code, load, { immediate: true })

function category(categoryId: string): CategoryWithNominees | undefined {
  return data.value?.categories.find((item) => item.id === categoryId)
}

function nomineeName(categoryId: string, nomineeId: string): string {
  return category(categoryId)?.nominees.find((n) => n.id === nomineeId)?.name ?? nomineeId
}

function sorted(tally: Record<string, number>): [string, number][] {
  return Object.entries(tally).sort(([, a], [, b]) => b - a)
}
</script>

<template>
  <main class="app-shell">
    <p v-if="loadError" class="error">{{ loadError }}</p>
    <p v-else-if="!data" class="muted">Cargando…</p>

    <template v-else>
      <section class="hero">
        <p class="kicker">Resultados · solo administradores</p>
        <h1>{{ data.name }}</h1>
        <p class="subtitle">
          {{ data.memberCount }} participantes ·
          <template v-if="data.snapshotTakenAt">
            foto de cierre tomada el {{ formatDateTime(data.snapshotTakenAt) }}
          </template>
          <template v-else>
            resultados parciales; la votación cierra el
            {{ formatDateTime(data.closesAt) }}
          </template>
        </p>
        <RouterLink :to="{ name: 'election', params: { code: data.code } }" class="btn">
          Volver a la votación
        </RouterLink>
      </section>

      <article v-for="item in data.results" :key="item.categoryId" class="card result">
        <h2>{{ category(item.categoryId)?.name }}</h2>

        <p v-if="item.result.winners.length === 0" class="muted">Sin respuestas.</p>
        <p v-else>
          <strong>{{ item.result.winners.length > 1 ? 'Empate:' : 'Ganador:' }}</strong>
          {{
            item.result.winners.map((id) => nomineeName(item.categoryId, id)).join(', ')
          }}
        </p>
        <p class="muted">{{ item.result.totalBallots }} respuestas</p>

        <ul v-if="item.votingMethod === 'plurality'">
          <li v-for="[nomineeId, votes] in sorted(item.result.tally)" :key="nomineeId">
            {{ nomineeName(item.categoryId, nomineeId) }}: {{ votes }}
          </li>
        </ul>

        <details v-else-if="item.result.totalBallots > 0" open>
          <summary>Rondas de eliminación</summary>
          <div v-for="round in item.result.rounds" :key="round.round" class="round">
            <h3>Ronda {{ round.round }}</h3>
            <ul>
              <li v-for="[nomineeId, votes] in sorted(round.tally)" :key="nomineeId">
                {{ nomineeName(item.categoryId, nomineeId) }}: {{ votes }}
              </li>
            </ul>
            <p v-if="round.eliminated.length > 0" class="muted">
              Eliminado:
              {{
                round.eliminated.map((id) => nomineeName(item.categoryId, id)).join(', ')
              }}
            </p>
            <p v-if="round.exhaustedBallots > 0" class="muted">
              Rankings sin opciones restantes: {{ round.exhaustedBallots }}
            </p>
          </div>
        </details>
      </article>
    </template>
  </main>
</template>

<style scoped>
.result {
  margin-top: 1rem;
}

.round h3 {
  margin: 0.8rem 0 0.3rem;
  font-size: 1rem;
}
</style>

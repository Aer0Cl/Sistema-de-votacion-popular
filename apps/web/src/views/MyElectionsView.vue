<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { isValidElectionCode } from '@votacion/voting-core'
import { api } from '@/api'
import type { ElectionPreview, ElectionSummary } from '@/api'
import { useAnswersStore } from '@stores/answers'
import { useElectionsStore } from '@stores/elections'
import { useSessionStore } from '@stores/session'
import { errorMessage, formatDateTime } from '@/utils/format'

const router = useRouter()
const session = useSessionStore()
const elections = useElectionsStore()
const answers = useAnswersStore()

const loadError = ref('')
const code = ref('')
const preview = ref<ElectionPreview | null>(null)
const joinError = ref('')
const busy = ref(false)

onMounted(async () => {
  try {
    await Promise.all([elections.load(), answers.load()])
  } catch (error) {
    loadError.value = errorMessage(error)
  }
})

function answeredCount(election: ElectionSummary): number {
  return election.categoryIds.filter((id) => answers.byCategory[id]).length
}

async function findElection() {
  joinError.value = ''
  preview.value = null
  if (!isValidElectionCode(code.value)) {
    joinError.value = 'El identificador tiene entre 6 y 8 letras o números.'
    return
  }
  busy.value = true
  try {
    preview.value = await api.previewElection(code.value)
  } catch (error) {
    joinError.value = errorMessage(error)
  } finally {
    busy.value = false
  }
}

async function join() {
  if (!preview.value) {
    return
  }
  busy.value = true
  try {
    const election = await elections.join(preview.value.code)
    await router.push({ name: 'election', params: { code: election.code } })
  } catch (error) {
    joinError.value = errorMessage(error)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <main class="app-shell">
    <section class="hero">
      <p class="kicker">Votación popular</p>
      <h1>Mis votaciones</h1>
      <p class="subtitle">
        Tus respuestas por categoría se comparten entre todas las votaciones abiertas en
        las que participas. Cuando una votación cierra, se guarda una foto de las
        respuestas de ese momento.
      </p>
    </section>

    <section class="grid two">
      <article class="card">
        <h2>Unirme a una votación</h2>
        <form class="stack" @submit.prevent="findElection">
          <label class="field">
            Identificador
            <input
              v-model="code"
              maxlength="8"
              placeholder="Ej: OFIC2027"
              autocomplete="off"
              @input="preview = null"
            />
          </label>
          <button class="btn" type="submit" :disabled="busy">Buscar</button>
        </form>
        <p v-if="joinError" class="error">{{ joinError }}</p>
        <div v-if="preview" class="preview">
          <p>
            <strong>{{ preview.name }}</strong> · {{ preview.categoryCount }} categorías
          </p>
          <p class="muted">
            {{ preview.status === 'open' ? 'Cierra' : 'Cerró' }} el
            {{ formatDateTime(preview.closesAt) }}
          </p>
          <button
            v-if="preview.status === 'open'"
            class="btn"
            type="button"
            :disabled="busy"
            @click="join"
          >
            Unirme
          </button>
          <p v-else class="error">Esta votación ya cerró.</p>
        </div>
      </article>

      <article v-if="session.isAdmin" class="card">
        <h2>Administración</h2>
        <p class="muted">Crea una votación y comparte su identificador con los participantes.</p>
        <RouterLink :to="{ name: 'create-election' }" class="btn">Crear votación</RouterLink>
      </article>
    </section>

    <p v-if="loadError" class="error">{{ loadError }}</p>
    <p v-else-if="elections.loaded && elections.items.length === 0" class="muted">
      Todavía no participas en ninguna votación.
    </p>

    <section class="grid">
      <RouterLink
        v-for="election in elections.items"
        :key="election.code"
        :to="{ name: 'election', params: { code: election.code } }"
        class="card election-card"
      >
        <div class="badges">
          <span class="badge" :class="election.status === 'open' ? 'badge-open' : 'badge-closed'">
            {{ election.status === 'open' ? 'Abierta' : 'Cerrada' }}
          </span>
          <span v-if="election.isAdmin" class="badge">Administras</span>
        </div>
        <h2>{{ election.name }}</h2>
        <p class="muted">
          {{ election.status === 'open' ? 'Cierra' : 'Cerró' }} el
          {{ formatDateTime(election.closesAt) }}
        </p>
        <p v-if="election.isMember && election.status === 'open'">
          Respondiste {{ answeredCount(election) }} de {{ election.categoryIds.length }}
          categorías
        </p>
        <p class="muted">
          {{ election.memberCount }} participantes · código {{ election.code }}
        </p>
      </RouterLink>
    </section>
  </main>
</template>

<style scoped>
.preview {
  margin-top: 1rem;
  padding-top: 0.8rem;
  border-top: 1px solid var(--border);
}

.election-card {
  color: inherit;
  text-decoration: none;
  margin-top: 1rem;
}

.badges {
  display: flex;
  gap: 0.4rem;
  margin-bottom: 0.5rem;
}
</style>

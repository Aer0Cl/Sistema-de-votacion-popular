<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { MAX_CATEGORIES, MIN_CATEGORIES, validateNewElection } from '@votacion/voting-core'
import type { Category } from '@votacion/voting-core'
import { api } from '@/api'
import { useElectionsStore } from '@stores/elections'
import { errorMessage } from '@/utils/format'

const router = useRouter()
const elections = useElectionsStore()

const catalog = ref<Category[]>([])
const name = ref('')
const closesAt = ref('')
const selected = ref<string[]>([])
const submitted = ref(false)
const serverError = ref('')
const saving = ref(false)

onMounted(async () => {
  try {
    catalog.value = await api.listCategories()
  } catch (error) {
    serverError.value = errorMessage(error)
  }
})

// datetime-local entrega la hora local sin zona; se convierte a ISO al enviar
const input = computed(() => ({
  name: name.value,
  closesAt: closesAt.value ? new Date(closesAt.value).toISOString() : '',
  categoryIds: selected.value,
}))

const errors = computed(() => validateNewElection(input.value, catalog.value, new Date()))

function selectAll() {
  selected.value = catalog.value.map((category) => category.id)
}

async function submit() {
  submitted.value = true
  serverError.value = ''
  if (errors.value.length > 0) {
    return
  }
  saving.value = true
  try {
    const election = await elections.create(input.value)
    await router.push({ name: 'election', params: { code: election.code } })
  } catch (error) {
    serverError.value = errorMessage(error)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <main class="app-shell">
    <section class="hero">
      <p class="kicker">Administración</p>
      <h1>Crear votación</h1>
      <p class="subtitle">
        Al crearla se genera un identificador de 8 caracteres para que los participantes
        se unan.
      </p>
    </section>

    <form class="card stack" @submit.prevent="submit">
      <label class="field">
        Nombre para mostrar
        <input v-model="name" maxlength="80" placeholder="Ej: Oscar en la oficina" />
      </label>

      <label class="field">
        Fecha de término
        <input v-model="closesAt" type="datetime-local" />
      </label>

      <fieldset class="categories">
        <legend>
          Categorías ({{ selected.length }} de {{ MIN_CATEGORIES }}–{{ MAX_CATEGORIES }})
        </legend>
        <div class="category-actions">
          <button type="button" class="link-button" @click="selectAll">Todas</button>
          <button type="button" class="link-button" @click="selected = []">Ninguna</button>
        </div>
        <label v-for="category in catalog" :key="category.id" class="category-option">
          <input v-model="selected" type="checkbox" :value="category.id" />
          {{ category.name }}
          <span v-if="category.votingMethod === 'ranked'" class="badge">Ranking</span>
        </label>
      </fieldset>

      <ul v-if="submitted && errors.length > 0" class="error">
        <li v-for="message in errors" :key="message">{{ message }}</li>
      </ul>
      <p v-if="serverError" class="error">{{ serverError }}</p>

      <div>
        <button class="btn" type="submit" :disabled="saving">
          {{ saving ? 'Creando…' : 'Crear votación' }}
        </button>
      </div>
    </form>
  </main>
</template>

<style scoped>
.categories {
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 0.8rem 1rem;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 0.35rem 1rem;
}

.categories legend {
  font-weight: 600;
  padding: 0 0.3rem;
}

.category-actions {
  grid-column: 1 / -1;
  display: flex;
  gap: 1rem;
}

.category-option {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
</style>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { MAX_CATEGORY_YEAR, MIN_CATEGORY_YEAR } from '@votacion/voting-core'
import type { VotingMethod } from '@votacion/voting-core'
import { api } from '@/api'
import type { CatalogCategory } from '@/api'
import CatalogCategoryEditor from '@components/CatalogCategoryEditor.vue'
import { errorMessage } from '@/utils/format'

const catalog = ref<CatalogCategory[]>([])
const loadError = ref('')
const currentYear = () => new Date().getFullYear()
const form = reactive({
  name: '',
  votingMethod: 'plurality' as VotingMethod,
  year: currentYear(),
})
const createError = ref('')
const creating = ref(false)

onMounted(async () => {
  try {
    catalog.value = await api.listCatalog()
  } catch (error) {
    loadError.value = errorMessage(error)
  }
})

function replace(updated: CatalogCategory) {
  const index = catalog.value.findIndex((category) => category.id === updated.id)
  if (index === -1) {
    catalog.value.push(updated)
  } else {
    catalog.value[index] = updated
  }
}

function remove(categoryId: string) {
  catalog.value = catalog.value.filter((category) => category.id !== categoryId)
}

async function createCategory() {
  creating.value = true
  createError.value = ''
  try {
    replace(await api.createCategory({ ...form }))
    form.name = ''
    form.votingMethod = 'plurality'
    form.year = currentYear()
  } catch (error) {
    createError.value = errorMessage(error)
  } finally {
    creating.value = false
  }
}
</script>

<template>
  <main class="app-shell">
    <section class="hero">
      <p class="kicker">Administración</p>
      <h1>Catálogo de categorías</h1>
      <p class="subtitle">
        Las categorías y sus nominados son los mismos en todas las votaciones. Una
        categoría necesita al menos 2 nominados para poder elegirse al crear una votación.
      </p>
    </section>

    <form class="card stack" @submit.prevent="createCategory">
      <h2>Nueva categoría</h2>
      <label class="field">
        Nombre
        <input v-model="form.name" maxlength="80" placeholder="Ej: Mejor sonido" />
      </label>
      <label class="field">
        Año de la premiación
        <input
          v-model.number="form.year"
          type="number"
          :min="MIN_CATEGORY_YEAR"
          :max="MAX_CATEGORY_YEAR"
          step="1"
          required
        />
      </label>
      <p class="muted">
        El id de la categoría combina el nombre y el año (Mejor sonido de 2026 →
        <code>mejor-sonido-2026</code>), por eso el año no se puede cambiar después. Un
        mismo nombre puede repetirse en años distintos.
      </p>
      <fieldset class="methods">
        <legend>Método de votación</legend>
        <label>
          <input v-model="form.votingMethod" type="radio" value="plurality" />
          Mayoría simple: cada votante elige un nominado
        </label>
        <label>
          <input v-model="form.votingMethod" type="radio" value="ranked" />
          Ranking: cada votante ordena a todos los nominados
        </label>
      </fieldset>
      <p class="muted">
        El método se puede cambiar mientras la categoría no se use en ninguna votación.
      </p>
      <p v-if="createError" class="error">{{ createError }}</p>
      <div>
        <button class="btn" type="submit" :disabled="creating || form.name.trim() === ''">
          Crear categoría
        </button>
      </div>
    </form>

    <p v-if="loadError" class="error">{{ loadError }}</p>

    <CatalogCategoryEditor
      v-for="category in catalog"
      :key="category.id"
      :category="category"
      @updated="replace"
      @deleted="remove"
    />
  </main>
</template>

<style scoped>
.methods {
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 0.6rem 1rem;
  display: grid;
  gap: 0.35rem;
}

.methods legend {
  font-weight: 600;
  padding: 0 0.3rem;
}
</style>

<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import { MIN_NOMINEES } from '@votacion/voting-core'
import type { Nominee, VotingMethod } from '@votacion/voting-core'
import { api } from '@/api'
import type { CatalogCategory } from '@/api'
import { errorMessage } from '@/utils/format'

const props = defineProps<{ category: CatalogCategory }>()

const emit = defineEmits<{
  (e: 'updated', category: CatalogCategory): void
  (e: 'deleted', categoryId: string): void
}>()

const name = ref('')
const votingMethod = ref<VotingMethod>('plurality')
const drafts = reactive<Record<string, { name: string; description: string }>>({})
const newNominee = reactive({ name: '', description: '' })
const busy = ref(false)
const error = ref('')

function reset() {
  name.value = props.category.name
  votingMethod.value = props.category.votingMethod
  for (const key of Object.keys(drafts)) {
    delete drafts[key]
  }
  for (const nominee of props.category.nominees) {
    drafts[nominee.id] = { name: nominee.name, description: nominee.description ?? '' }
  }
}

watch(() => props.category, reset, { immediate: true })

function nomineeChanged(nominee: Nominee) {
  const draft = drafts[nominee.id]
  return draft.name !== nominee.name || draft.description !== (nominee.description ?? '')
}

async function run(action: () => Promise<CatalogCategory>) {
  busy.value = true
  error.value = ''
  try {
    emit('updated', await action())
    return true
  } catch (caught) {
    error.value = errorMessage(caught)
    return false
  } finally {
    busy.value = false
  }
}

const categoryChanged = () =>
  name.value !== props.category.name || votingMethod.value !== props.category.votingMethod

function saveCategory() {
  return run(() =>
    api.updateCategory(props.category.id, {
      name: name.value,
      votingMethod: votingMethod.value,
    }),
  )
}

async function deleteCategory() {
  const message = `¿Eliminar "${props.category.name}" y sus ${props.category.nominees.length} nominados? No se puede deshacer.`
  if (!window.confirm(message)) {
    return
  }
  busy.value = true
  error.value = ''
  try {
    await api.deleteCategory(props.category.id)
    emit('deleted', props.category.id)
  } catch (caught) {
    error.value = errorMessage(caught)
  } finally {
    busy.value = false
  }
}

function saveNominee(nominee: Nominee) {
  return run(() => api.updateNominee(nominee.id, drafts[nominee.id]))
}

async function addNominee() {
  const added = await run(() => api.addNominee(props.category.id, { ...newNominee }))
  if (added) {
    newNominee.name = ''
    newNominee.description = ''
  }
}
</script>

<template>
  <details class="card category">
    <summary>
      <strong>{{ category.name }}</strong>
      <span v-if="category.year" class="badge" title="Forma parte del id; no se cambia">
        {{ category.year }}
      </span>
      <span class="badge">
        {{ category.votingMethod === 'ranked' ? 'Ranking' : 'Mayoría simple' }}
      </span>
      <span class="badge">{{ category.nominees.length }} nominados</span>
      <span v-if="category.locked" class="badge badge-closed">
        En {{ category.usedInElections }}
        {{ category.usedInElections === 1 ? 'votación' : 'votaciones' }}
      </span>
      <span v-if="category.nominees.length < MIN_NOMINEES" class="badge badge-closed">
        Necesita al menos {{ MIN_NOMINEES }} nominados
      </span>
    </summary>

    <form class="row" @submit.prevent="saveCategory">
      <label class="field grow">
        Nombre de la categoría
        <input v-model="name" maxlength="80" />
      </label>
      <label class="field">
        Método
        <select v-model="votingMethod" :disabled="category.locked">
          <option value="plurality">Mayoría simple</option>
          <option value="ranked">Ranking</option>
        </select>
      </label>
      <button class="btn" type="submit" :disabled="busy || !categoryChanged()">
        Guardar cambios
      </button>
      <button
        class="btn btn-secondary"
        type="button"
        :disabled="busy || category.locked"
        @click="deleteCategory"
      >
        Eliminar categoría
      </button>
    </form>

    <p v-if="category.locked" class="muted">
      La categoría ya se usa en una votación: no se puede eliminar, cambiar su método ni
      agregar nominados, porque cambiarían respuestas ya guardadas. Sí puedes corregir los
      nombres.
    </p>

    <h3>Nominados</h3>
    <p v-if="category.nominees.length === 0" class="muted">Todavía no hay nominados.</p>
    <form
      v-for="nominee in category.nominees"
      :key="nominee.id"
      class="row"
      @submit.prevent="saveNominee(nominee)"
    >
      <input
        v-model="drafts[nominee.id].name"
        class="grow"
        aria-label="Nombre"
        maxlength="120"
      />
      <input
        v-model="drafts[nominee.id].description"
        class="grow"
        aria-label="Descripción"
        placeholder="Descripción (opcional)"
        maxlength="200"
      />
      <button class="btn" type="submit" :disabled="busy || !nomineeChanged(nominee)">
        Guardar
      </button>
    </form>
    <p v-if="category.nominees.length > 0 && !category.locked" class="muted">
      Los nominados no se eliminan: para corregir uno, edítalo.
    </p>

    <form v-if="!category.locked" class="row add" @submit.prevent="addNominee">
      <input
        v-model="newNominee.name"
        class="grow"
        placeholder="Nuevo nominado"
        aria-label="Nombre del nuevo nominado"
        maxlength="120"
      />
      <input
        v-model="newNominee.description"
        class="grow"
        placeholder="Descripción (opcional)"
        aria-label="Descripción del nuevo nominado"
        maxlength="200"
      />
      <button class="btn" type="submit" :disabled="busy || newNominee.name.trim() === ''">
        Agregar
      </button>
    </form>

    <p v-if="error" class="error">{{ error }}</p>
  </details>
</template>

<style scoped>
.category {
  margin-top: 0.8rem;
}

summary {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
}

h3 {
  margin: 1rem 0 0.3rem;
  font-size: 1rem;
}

.row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 0.5rem;
  margin-top: 0.5rem;
}

.row input,
.row select {
  font: inherit;
  padding: 0.45rem 0.6rem;
  border: 1px solid var(--border);
  border-radius: 8px;
}

.row .btn {
  margin-top: 0;
}

.grow {
  flex: 1 1 200px;
}

.add {
  padding-top: 0.6rem;
  border-top: 1px dashed var(--border);
}
</style>

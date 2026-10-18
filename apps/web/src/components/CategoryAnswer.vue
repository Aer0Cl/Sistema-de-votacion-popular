<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Answer, AnswerChoice, Nominee } from '@votacion/voting-core'
import type { CategoryWithNominees } from '@/api'
import RankingEditor from '@components/RankingEditor.vue'
import { formatDateTime } from '@/utils/format'

const props = defineProps<{
  category: CategoryWithNominees
  answer?: Answer
  editable: boolean
  saving: boolean
  error?: string
  // otras votaciones abiertas mias donde tambien se usa esta respuesta
  sharedWith: string[]
  // votaciones cerradas donde quedo registrada una respuesta para esta categoria
  frozenIn: string[]
}>()

const emit = defineEmits<{
  (e: 'save', choice: AnswerChoice): void
}>()

const selected = ref<string | null>(null)
const order = ref<Nominee[]>([])

function orderFromAnswer(): Nominee[] {
  const nominees = props.category.nominees
  if (!props.answer || !('ranking' in props.answer)) {
    return [...nominees]
  }
  const ranked = props.answer.ranking.flatMap((id) => nominees.filter((n) => n.id === id))
  return [...ranked, ...nominees.filter((nominee) => !ranked.includes(nominee))]
}

function resetDraft() {
  selected.value = props.answer && 'nomineeId' in props.answer ? props.answer.nomineeId : null
  order.value = orderFromAnswer()
}

watch(() => [props.answer, props.category], resetDraft, { immediate: true })

const isRanked = computed(() => props.category.votingMethod === 'ranked')

const dirty = computed(() => {
  if (isRanked.value) {
    const saved = props.answer && 'ranking' in props.answer ? props.answer.ranking : null
    const current = order.value.map((nominee) => nominee.id)
    return saved === null || saved.join('|') !== current.join('|')
  }
  const saved = props.answer && 'nomineeId' in props.answer ? props.answer.nomineeId : null
  return selected.value !== null && selected.value !== saved
})

function save() {
  if (isRanked.value) {
    emit('save', { ranking: order.value.map((nominee) => nominee.id) })
  } else if (selected.value) {
    emit('save', { nomineeId: selected.value })
  }
}
</script>

<template>
  <article class="card category-card">
    <header class="category-header">
      <h2>{{ category.name }}</h2>
      <span class="badge">{{ isRanked ? 'Ranking de preferencias' : 'Mayoría simple' }}</span>
    </header>

    <p v-if="isRanked && editable" class="muted">
      Ordena a los nominados del favorito al menos preferido.
    </p>

    <RankingEditor v-if="isRanked" v-model:nominees="order" :disabled="!editable" />

    <div v-else class="options">
      <label
        v-for="nominee in category.nominees"
        :key="nominee.id"
        class="option"
        :class="{ 'option-selected': selected === nominee.id }"
      >
        <input
          v-model="selected"
          type="radio"
          :name="category.id"
          :value="nominee.id"
          :disabled="!editable"
        />
        {{ nominee.name }}
      </label>
    </div>

    <p v-if="!answer" class="muted">Aún no respondes esta categoría.</p>
    <p v-else class="muted">Guardada el {{ formatDateTime(answer.updatedAt) }}.</p>

    <template v-if="editable">
      <p v-if="sharedWith.length > 0" class="muted">
        Tu respuesta también se aplica en: {{ sharedWith.join(', ') }}.
      </p>
      <p v-if="frozenIn.length > 0" class="muted">
        En {{ frozenIn.join(', ') }} (cerrada) queda tu respuesta registrada al cierre; los
        cambios no la afectan.
      </p>
      <p v-if="error" class="error">{{ error }}</p>
      <button class="btn" type="button" :disabled="!dirty || saving" @click="save">
        {{ saving ? 'Guardando…' : 'Guardar respuesta' }}
      </button>
    </template>
  </article>
</template>

<style scoped>
.category-card {
  margin-top: 1rem;
}

.category-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.options {
  display: grid;
  gap: 0.4rem;
}

.option {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.55rem 0.8rem;
  border: 1px solid var(--border);
  border-radius: 10px;
  cursor: pointer;
}

.option-selected {
  border-color: var(--accent);
  background: rgba(15, 109, 98, 0.08);
}
</style>

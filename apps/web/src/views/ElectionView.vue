<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import type { Answer, AnswerChoice } from '@votacion/voting-core'
import { api } from '@/api'
import type { ElectionDetail } from '@/api'
import CategoryAnswer from '@components/CategoryAnswer.vue'
import { useAnswersStore } from '@stores/answers'
import { useElectionsStore } from '@stores/elections'
import { errorMessage, formatDateTime } from '@/utils/format'

const props = defineProps<{ code: string }>()

const elections = useElectionsStore()
const answers = useAnswersStore()

const election = ref<ElectionDetail | null>(null)
const loadError = ref('')
const savingCategory = ref<string | null>(null)
const saveErrors = reactive<Record<string, string>>({})

async function load() {
  loadError.value = ''
  election.value = null
  try {
    const [detail] = await Promise.all([
      api.getElection(props.code),
      elections.loaded ? Promise.resolve() : elections.load(),
      answers.loaded ? Promise.resolve() : answers.load(),
    ])
    election.value = detail
  } catch (error) {
    loadError.value = errorMessage(error)
  }
}

watch(() => props.code, load, { immediate: true })

const isOpen = computed(() => election.value?.status === 'open')
const editable = computed(() => isOpen.value && election.value?.isMember === true)

// Abierta: respuesta actual (compartida). Cerrada: la que quedo en la foto de cierre.
function answerFor(categoryId: string): Answer | undefined {
  if (isOpen.value) {
    return answers.byCategory[categoryId]
  }
  return election.value?.myAnswers.find((answer) => answer.categoryId === categoryId)
}

function otherJoined(categoryId: string, status: 'open' | 'closed'): string[] {
  return elections.joined
    .filter(
      (item) =>
        item.code !== props.code &&
        item.status === status &&
        item.categoryIds.includes(categoryId),
    )
    .map((item) => item.name)
}

async function save(categoryId: string, choice: AnswerChoice) {
  savingCategory.value = categoryId
  delete saveErrors[categoryId]
  try {
    await answers.save(categoryId, choice)
  } catch (error) {
    saveErrors[categoryId] = errorMessage(error)
  } finally {
    savingCategory.value = null
  }
}

const answered = computed(
  () => election.value?.categories.filter((category) => answerFor(category.id)).length ?? 0,
)
</script>

<template>
  <main class="app-shell">
    <p v-if="loadError" class="error">{{ loadError }}</p>
    <p v-else-if="!election" class="muted">Cargando…</p>

    <template v-else>
      <section class="hero">
        <p class="kicker">
          {{ isOpen ? 'Abierta' : 'Cerrada' }} · código {{ election.code }}
        </p>
        <h1>{{ election.name }}</h1>
        <p class="subtitle">
          {{ isOpen ? 'Cierra' : 'Cerró' }} el {{ formatDateTime(election.closesAt) }} ·
          {{ election.memberCount }} participantes · {{ election.categories.length }}
          categorías
        </p>
        <p v-if="election.isMember" class="subtitle">
          {{ isOpen ? 'Respondiste' : 'Quedaron registradas' }} {{ answered }} de
          {{ election.categories.length }} categorías.
        </p>
        <RouterLink
          v-if="election.isAdmin"
          :to="{ name: 'results', params: { code: election.code } }"
          class="btn"
        >
          Ver resultados
        </RouterLink>
      </section>

      <p v-if="!election.isMember" class="muted">
        Administras esta votación pero no participas en ella. Únete con su identificador
        para responder.
      </p>
      <p v-else-if="!isOpen" class="muted">
        Esta votación cerró. Estas son las respuestas que quedaron registradas; si cambias
        tus respuestas en otras votaciones, aquí no cambian.
      </p>

      <CategoryAnswer
        v-for="category in election.categories"
        :key="category.id"
        :category="category"
        :answer="answerFor(category.id)"
        :editable="editable"
        :saving="savingCategory === category.id"
        :error="saveErrors[category.id]"
        :shared-with="otherJoined(category.id, 'open')"
        :frozen-in="otherJoined(category.id, 'closed')"
        @save="(choice) => save(category.id, choice)"
      />
    </template>
  </main>
</template>

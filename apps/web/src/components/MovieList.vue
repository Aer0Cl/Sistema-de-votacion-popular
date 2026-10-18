<script setup lang="ts">
import { computed } from 'vue'
import type { Movie } from '@interfaces/movie'
import { VueDraggableNext } from 'vue-draggable-next'

const props = withDefaults(
  defineProps<{
    movies: Movie[]
    dragEnabled?: boolean
  }>(),
  {
    dragEnabled: true,
  },
)

const emit = defineEmits<{
  (e: 'update:movies', value: Movie[]): void
  (e: 'change', value: Movie[]): void
  (e: 'save', value: Movie[]): void
}>()

const list = computed<Movie[]>({
  get: () => props.movies,
  set: (value) => emit('update:movies', value),
})

function onListChange() {
  if (!props.dragEnabled) {
    return
  }

  emit('change', list.value)
}

function resetList() {
  if (!props.dragEnabled) {
    return
  }

  list.value = [...props.movies]
}

function saveRanking() {
  emit('save', list.value)
}
</script>

<template>
  <section class="card">
    <h2>Arrastra y suelta para reordenar</h2>
    <VueDraggableNext
      v-if="props.dragEnabled"
      v-model="list"
      item-key="id"
      handle=".drag-handle"
      ghost-class="movie-row-ghost"
      chosen-class="movie-row-chosen"
      @change="onListChange"
    >
      <div v-for="(movie, index) in list" :key="movie.id" class="movie-row">
        <span class="drag-handle" aria-label="Arrastrar elemento">::</span>
        <span class="movie-rank">{{ index + 1 }}</span>
        <span class="movie-name">{{ movie.name }}</span>
      </div>
    </VueDraggableNext>
    <div v-else>
      <div v-for="(movie, index) in list" :key="movie.id" class="movie-row">
        <span class="movie-rank">{{ index + 1 }}</span>
        <span class="movie-name">{{ movie.name }}</span>
      </div>
    </div>
    <button v-if="props.dragEnabled" style="margin-left: 0.5rem" @click="saveRanking">
      Guardar ranking
    </button>
  </section>
</template>
<style scoped>
.movie-row {
  display: grid;
  grid-template-columns: 2.2rem 2.2rem 1fr;
  align-items: center;
  gap: 0.7rem;
  padding: 0.7rem 0.8rem;
  margin-top: 0.55rem;
  border: 1px solid #d8e0ea;
  border-radius: 10px;
  background: #ffffff;
}

.drag-handle {
  cursor: grab;
  user-select: none;
  color: #0f6d62;
  font-weight: 700;
}

.drag-handle:active {
  cursor: grabbing;
}

.movie-rank {
  width: 1.8rem;
  height: 1.8rem;
  display: inline-flex;
  justify-content: center;
  align-items: center;
  border-radius: 999px;
  background: rgba(15, 109, 98, 0.14);
  color: #0b5c53;
  font-size: 0.85rem;
  font-weight: 700;
}

.movie-name {
  color: #162233;
}

.movie-row-ghost {
  opacity: 0.45;
}

.movie-row-chosen {
  box-shadow: 0 8px 20px rgba(18, 40, 72, 0.15);
}
</style>

<script setup lang="ts">
import { computed } from 'vue'
import { VueDraggableNext } from 'vue-draggable-next'
import type { Nominee } from '@votacion/voting-core'

const props = withDefaults(
  defineProps<{
    nominees: Nominee[]
    disabled?: boolean
  }>(),
  {
    disabled: false,
  },
)

const emit = defineEmits<{
  (e: 'update:nominees', value: Nominee[]): void
}>()

const list = computed<Nominee[]>({
  get: () => props.nominees,
  set: (value) => emit('update:nominees', value),
})

// Alternativa al arrastre para teclado y pantallas tactiles
function move(index: number, offset: number) {
  const target = index + offset
  if (target < 0 || target >= list.value.length) {
    return
  }
  const next = [...list.value]
  ;[next[index], next[target]] = [next[target], next[index]]
  list.value = next
}
</script>

<template>
  <VueDraggableNext
    v-if="!props.disabled"
    v-model="list"
    item-key="id"
    handle=".drag-handle"
    ghost-class="nominee-row-ghost"
    chosen-class="nominee-row-chosen"
  >
    <div v-for="(nominee, index) in list" :key="nominee.id" class="nominee-row">
      <span class="drag-handle" aria-hidden="true">::</span>
      <span class="nominee-rank">{{ index + 1 }}</span>
      <span class="nominee-name">{{ nominee.name }}</span>
      <span class="move-buttons">
        <button
          type="button"
          :disabled="index === 0"
          :aria-label="`Subir ${nominee.name}`"
          @click="move(index, -1)"
        >
          ↑
        </button>
        <button
          type="button"
          :disabled="index === list.length - 1"
          :aria-label="`Bajar ${nominee.name}`"
          @click="move(index, 1)"
        >
          ↓
        </button>
      </span>
    </div>
  </VueDraggableNext>
  <div v-else>
    <div v-for="(nominee, index) in list" :key="nominee.id" class="nominee-row">
      <span></span>
      <span class="nominee-rank">{{ index + 1 }}</span>
      <span class="nominee-name">{{ nominee.name }}</span>
    </div>
  </div>
</template>

<style scoped>
.nominee-row {
  display: grid;
  grid-template-columns: 1.4rem 2.2rem 1fr auto;
  align-items: center;
  gap: 0.7rem;
  padding: 0.6rem 0.8rem;
  margin-top: 0.5rem;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface);
}

.drag-handle {
  cursor: grab;
  user-select: none;
  color: var(--accent);
  font-weight: 700;
}

.drag-handle:active {
  cursor: grabbing;
}

.nominee-rank {
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

.move-buttons {
  display: flex;
  gap: 0.25rem;
}

.move-buttons button {
  border: 1px solid var(--border);
  background: var(--surface);
  border-radius: 6px;
  padding: 0.15rem 0.45rem;
  cursor: pointer;
}

.move-buttons button:disabled {
  opacity: 0.35;
  cursor: default;
}

.nominee-row-ghost {
  opacity: 0.45;
}

.nominee-row-chosen {
  box-shadow: 0 8px 20px rgba(18, 40, 72, 0.15);
}
</style>

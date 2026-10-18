import { defineStore } from 'pinia'
import type { Answer, AnswerChoice } from '@votacion/voting-core'
import { api } from '@/api'

// Respuestas actuales del usuario; una por categoria, compartida entre sus votaciones
export const useAnswersStore = defineStore('answers', {
  state: () => ({
    byCategory: {} as Record<string, Answer>,
    loaded: false,
  }),
  actions: {
    async load() {
      const answers = await api.getMyAnswers()
      this.byCategory = Object.fromEntries(answers.map((answer) => [answer.categoryId, answer]))
      this.loaded = true
    },
    async save(categoryId: string, choice: AnswerChoice) {
      const answer = await api.saveAnswer(categoryId, choice)
      this.byCategory[categoryId] = answer
      return answer
    },
  },
})

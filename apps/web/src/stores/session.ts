import { defineStore } from 'pinia'
import type { User } from '@votacion/voting-core'
import { api } from '@/api'
import { useAnswersStore } from '@stores/answers'
import { useElectionsStore } from '@stores/elections'

// Sin autenticacion todavia: el usuario se elige en la barra de navegacion
export const useSessionStore = defineStore('session', {
  state: () => ({
    user: null as User | null,
    users: [] as User[],
    loaded: false,
  }),
  getters: {
    isAdmin: (state) => state.user?.role === 'admin',
  },
  actions: {
    async ensureLoaded() {
      if (this.loaded) {
        return
      }
      this.users = await api.listUsers()
      this.user = await api.getMe()
      this.loaded = true
    },
    async switchUser(userId: string) {
      api.setUser(userId)
      this.user = await api.getMe()
      useElectionsStore().$reset()
      useAnswersStore().$reset()
    },
  },
})

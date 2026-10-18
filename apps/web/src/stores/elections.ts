import { defineStore } from 'pinia'
import type { NewElectionInput } from '@votacion/voting-core'
import { api } from '@/api'
import type { ElectionSummary } from '@/api'

export const useElectionsStore = defineStore('elections', {
  state: () => ({
    items: [] as ElectionSummary[],
    loaded: false,
  }),
  getters: {
    byCode: (state) => (code: string) => state.items.find((item) => item.code === code),
    // votaciones en las que participo, para mostrar donde se usa cada respuesta
    joined: (state) => state.items.filter((item) => item.isMember),
  },
  actions: {
    async load() {
      this.items = await api.listMyElections()
      this.loaded = true
    },
    async join(code: string) {
      const election = await api.joinElection(code)
      this.upsert(election)
      return election
    },
    async create(input: NewElectionInput) {
      const election = await api.createElection(input)
      this.upsert(election)
      return election
    },
    async leave(code: string) {
      const election = await api.leaveElection(code)
      if (election) {
        this.upsert(election)
      } else {
        this.items = this.items.filter((item) => item.code !== code)
      }
      return election
    },
    upsert(election: ElectionSummary) {
      const index = this.items.findIndex((item) => item.code === election.code)
      if (index === -1) {
        this.items.push(election)
      } else {
        this.items[index] = election
      }
    },
  },
})

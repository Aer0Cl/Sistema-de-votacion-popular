import { defineStore } from 'pinia'
import type { User } from '@/interfaces/user'
import type { Movie } from '@interfaces/movie'

const defaultUsers: User[] = [
  { id: 1, name: 'Alice', rankedMovies: [] },
  { id: 2, name: 'Bob', rankedMovies: [] },
  { id: 3, name: 'Charlie', rankedMovies: [] },
]

function cloneUsers(users: User[]): User[] {
  return users.map((user) => ({
    ...user,
    rankedMovies: user.rankedMovies.map((movie) => ({ ...movie })),
  }))
}

export const useUsersStore = defineStore('users', {
  state: () => ({
    users: cloneUsers(defaultUsers),
  }),
  getters: {
    userCount: (state) => state.users.length,
    getUserById: (state) => (id: number) => state.users.find((user) => user.id === id),
    getUsers: (state) => state.users,
  },
  actions: {
    addUser(id: number, name: string) {
      this.users.push({ id, name, rankedMovies: [] })
    },
    removeUser(id: number) {
      this.users = this.users.filter((user) => user.id !== id)
    },
    resetUsers() {
      this.users = cloneUsers(defaultUsers)
    },
    updateRanking(userId: number, rankedMovies: Movie[]) {
      const user = this.users.find((u) => u.id === userId)

      if (!user) {
        return
      }

      user.rankedMovies = rankedMovies.map((movie) => ({ ...movie }))
    },
  },
})

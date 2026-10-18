<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useSessionStore } from '@stores/session'

const session = useSessionStore()
const router = useRouter()

// La vista se vuelve a montar al cambiar de usuario (ver la key de RouterView)
async function onUserChange(event: Event) {
  const userId = (event.target as HTMLSelectElement).value
  await session.switchUser(userId)
  await router.replace({ name: 'home' })
}
</script>

<template>
  <header class="top-nav-wrap">
    <nav class="top-nav">
      <RouterLink to="/" class="top-link">Mis votaciones</RouterLink>
      <RouterLink to="/about" class="top-link">Acerca</RouterLink>
      <label v-if="session.user" class="user-switch">
        Usuario de prueba
        <select :value="session.user.id" @change="onUserChange">
          <option v-for="user in session.users" :key="user.id" :value="user.id">
            {{ user.displayName }}
          </option>
        </select>
      </label>
    </nav>
  </header>

  <RouterView :key="`${session.user?.id}-${$route.fullPath}`" />
</template>

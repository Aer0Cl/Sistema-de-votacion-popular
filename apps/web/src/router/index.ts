import { createRouter, createWebHistory } from 'vue-router'
import { useSessionStore } from '@stores/session'

declare module 'vue-router' {
  interface RouteMeta {
    requiresAdmin?: boolean
  }
}

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('@views/MyElectionsView.vue'),
    },
    {
      path: '/votaciones/nueva',
      name: 'create-election',
      component: () => import('@views/CreateElectionView.vue'),
      meta: { requiresAdmin: true },
    },
    {
      path: '/votaciones/:code',
      name: 'election',
      component: () => import('@views/ElectionView.vue'),
      props: true,
    },
    {
      path: '/votaciones/:code/resultados',
      name: 'results',
      component: () => import('@views/ResultsView.vue'),
      props: true,
    },
    {
      path: '/about',
      name: 'about',
      component: () => import('@views/AboutView.vue'),
    },
  ],
})

router.beforeEach(async (to) => {
  const session = useSessionStore()
  await session.ensureLoaded()
  if (to.meta.requiresAdmin && !session.isAdmin) {
    return { name: 'home' }
  }
})

export default router

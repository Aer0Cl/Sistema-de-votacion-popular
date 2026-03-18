<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useCounterStore } from '@stores/counter'

const counterStore = useCounterStore()
const { count, doubleCount } = storeToRefs(counterStore)
</script>

<template>
  <main class="app-shell">
    <section class="hero">
      <p class="kicker">Vue + TypeScript + AWS</p>
      <h1>Template base para iniciar tu web app</h1>
      <p class="subtitle">
        Estructura inicial lista para desarrollo local y despliegue en AWS con
        S3 + CloudFront.
      </p>
    </section>

    <section class="grid">
      <article class="card">
        <h2>Frontend</h2>
        <ul>
          <li>Vue 3 con TypeScript</li>
          <li>Vite para build rapido</li>
          <li>Base lista para modulos por feature</li>
        </ul>
      </article>

      <article class="card">
        <h2>Infraestructura AWS</h2>
        <ul>
          <li>CloudFormation como IaC</li>
          <li>S3 privado para artefactos estaticos</li>
          <li>CloudFront para cache global y HTTPS</li>
        </ul>
      </article>

      <article class="card">
        <h2>Automatizacion</h2>
        <ul>
          <li>Script local de despliegue</li>
          <li>Workflow CI/CD con GitHub Actions</li>
          <li>Invalidacion de cache automatica</li>
        </ul>
      </article>
    </section>

    <section class="card counter-card">
      <h2>Pinia listo</h2>
      <p>Contador: {{ count }} | Doble: {{ doubleCount }}</p>
      <button class="btn" type="button" @click="counterStore.increment">
        Incrementar
      </button>
    </section>
  </main>
</template>

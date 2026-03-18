<template>
  <header class="top-nav-wrap">
    <nav class="top-nav">
      <RouterLink to="/" class="top-link">Inicio</RouterLink>
      <RouterLink to="/about" class="top-link">Acerca</RouterLink>
      <RouterLink to="/movie-list" class="top-link">Movies</RouterLink>
    </nav>
  </header>

  <RouterView />
</template>

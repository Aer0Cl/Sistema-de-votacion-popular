<template>
  <main class="app-shell">
    <section class="hero">
      <p class="kicker">Votacion popular</p>
      <h1>Vota por tus favoritos, categoria por categoria</h1>
      <p class="subtitle">
        Una votacion al estilo de los premios Oscar: algunas categorias se deciden por
        mayoria simple y otras, como Mejor Pelicula, por ranking de preferencias.
      </p>
    </section>

    <section class="grid">
      <article class="card">
        <h2>Mayoria simple</h2>
        <p>Eliges un nominado por categoria y gana el que recibe mas votos.</p>
      </article>

      <article class="card">
        <h2>Ranking de preferencias</h2>
        <p>
          Ordenas a los nominados del favorito al menos preferido. Si nadie supera la
          mitad de los votos, se elimina al ultimo y sus votos pasan a la siguiente
          preferencia.
        </p>
        <RouterLink to="/movie-list" class="btn">Probar el ranking</RouterLink>
      </article>

      <article class="card">
        <h2>Resultados por grupo</h2>
        <p>Cada voto se asocia a un usuario, y los resultados se pueden ver por grupo.</p>
      </article>
    </section>
  </main>
</template>

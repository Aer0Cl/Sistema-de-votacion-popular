# Plan de desarrollo: Sistema de votacion popular (estilo Oscar)

## 1. Objetivo

Sistema web donde un conjunto de usuarios vota en un evento con varias categorias:

- **Mayoria simple (plurality):** cada votante elige un nominado; gana el que tenga mas votos.
  Ej: Mejor Actor, Mejor Banda Sonora.
- **Voto preferencial (ranking / instant runoff):** cada votante ordena los nominados; se cuentan
  primeras preferencias y, si nadie supera el 50% de las papeletas activas, se elimina al ultimo y
  sus votos pasan a la siguiente preferencia. Ej: Mejor Pelicula (asi lo hace la Academia).

Cada voto queda asociado a un usuario, y los usuarios pueden pertenecer a grupos para calcular
resultados globales y por grupo.

## 2. Estado actual del proyecto

| Area | Estado |
| --- | --- |
| Frontend | Vue 3 + TS + Vite + Pinia + Router, a partir de un template |
| Ranking | `MovieListView` + `MovieList` (drag & drop con `vue-draggable-next`) para 3 usuarios mock |
| Conteo | `useRanking.finishVoting()` implementa un instant runoff en el cliente, mutando los stores |
| Datos | Peliculas y usuarios hardcodeados en `stores/movies.ts` y `stores/users.ts` |
| Backend | No existe |
| Infra | CloudFormation para sitio estatico (S3 + CloudFront) y workflow de GitHub Actions |
| Tests | No hay framework de pruebas |

### Problemas detectados en el codigo actual

1. **Bucle potencialmente infinito en `finishVoting`:** la pelicula eliminada nunca se quita de
   `moviesStore.movies`; en la siguiente ronda queda con 0 votos al final y se "elimina" otra vez,
   sin avanzar. Ademas, si la segunda preferencia de un usuario ya estaba eliminada, se le cuenta un
   voto a una pelicula fuera de carrera.
2. **El conteo destruye los rankings:** `user.rankedMovies.shift()` modifica las papeletas
   originales; no se puede recalcular ni auditar.
3. **Sin manejo de empates** (por el ultimo lugar ni por el primero) ni de papeletas agotadas.
4. **Mayoria calculada sobre el total de usuarios**, no sobre las papeletas activas de la ronda.
5. La logica de negocio vive en un composable acoplado a Pinia, por lo que no es testeable ni
   reutilizable en el backend.
6. Restos del template: `counter.ts`, `HelloWorld.vue`, `HomeView`/`AboutView` genericos, README y
   `docs/plan-accion-desarrollo.md` genericos; el README menciona `npm run dev` pero el script se llama
   `start-dev`; los nombres de stack en el workflow (`vue-ts-webapp`) son del template.

## 3. Arquitectura propuesta

Se mantiene AWS y CloudFormation, agregando un backend serverless:

```
 Navegador (Vue SPA)
      |  HTTPS + JWT
      v
 CloudFront ──> S3 (frontend estatico)
      |
      └──> API Gateway (HTTP API) ──> Lambda (Node 22 + TS) ──> DynamoDB
                    |
               Cognito (autenticacion, grupo "admin")
```

**Por que serverless + DynamoDB:** el volumen de una votacion es bajo y por rafagas, el costo en
reposo es casi cero y encaja con la infra existente. El conteo se hace en memoria leyendo todas las
papeletas de una categoria (cientos o miles de registros), por lo que no se necesitan agregaciones
SQL. *Alternativa:* si se prefiere SQL, el mismo diseño de API funciona con Fastify + PostgreSQL;
solo cambia la capa de repositorios.

### Estructura de repositorio (npm workspaces)

```
apps/
  web/             <- frontend actual (movido desde la raiz)
  api/             <- handlers Lambda, validacion, repositorios
packages/
  voting-core/     <- tipos de dominio + algoritmos de conteo (puro TS, sin dependencias)
infra/
  cloudformation/  <- static-site.yaml + api.yaml (SAM)
```

`voting-core` se comparte entre `api` (calculo oficial) y `web` (tipos y, opcionalmente, vista
previa del conteo).

## 4. Modelo de datos

```ts
type VotingMethod = 'plurality' | 'ranked'
type ElectionStatus = 'draft' | 'open' | 'closed' | 'published'

interface Election {          // el "evento", ej: "Premios 2026"
  id: string
  name: string
  status: ElectionStatus
  opensAt?: string
  closesAt?: string
}

interface Category {
  id: string
  electionId: string
  name: string                // "Mejor Pelicula"
  votingMethod: VotingMethod
  order: number
}

interface Nominee {           // "participante" de la votacion
  id: string
  categoryId: string
  name: string
  description?: string
  imageUrl?: string
}

interface User {
  id: string                  // sub de Cognito
  displayName: string
  role: 'voter' | 'admin'
}

interface Group {
  id: string
  name: string                // "Oficina Santiago", "Familia", ...
}

interface GroupMembership {
  groupId: string
  userId: string
}

interface Ballot {            // una papeleta por usuario por categoria
  electionId: string
  categoryId: string
  userId: string
  nomineeId?: string          // si votingMethod = 'plurality'
  ranking?: string[]          // si votingMethod = 'ranked' (ids en orden de preferencia)
  submittedAt: string
  updatedAt: string
}
```

**Decision sobre grupos:** el voto se asocia solo al usuario; el grupo se deriva de la membresia.
Asi un usuario puede estar en varios grupos y su voto cuenta en cada uno sin duplicar papeletas.
Al cerrar la votacion se guarda una *foto* de las membresias (`groupSnapshot`) para que los
resultados publicados no cambien si despues alguien entra o sale de un grupo.

### Diseño DynamoDB (tabla unica)

| Entidad | PK | SK |
| --- | --- | --- |
| Election | `ELECTION#<id>` | `META` |
| Category | `ELECTION#<id>` | `CATEGORY#<order>#<catId>` |
| Nominee | `CATEGORY#<catId>` | `NOMINEE#<id>` |
| Ballot | `CATEGORY#<catId>` | `BALLOT#<userId>` |
| Ballot (por usuario) | GSI1: `USER#<userId>` | `ELECTION#<id>#CATEGORY#<catId>` |
| Group | `GROUP#<id>` | `META` |
| Membership | `GROUP#<id>` | `MEMBER#<userId>` (GSI1: `USER#<userId>` / `GROUP#<id>`) |
| Result | `ELECTION#<id>` | `RESULT#<catId>#<groupId \| ALL>` |

Con esto: "todos los nominados de una categoria", "todas las papeletas de una categoria",
"mis votos en un evento" y "miembros de un grupo" son una sola `Query` cada una.

## 5. API REST

Todas las rutas requieren JWT de Cognito salvo que se indique. Prefijo `/api/v1`.

### Lectura de participantes (votante)

| Metodo | Ruta | Descripcion |
| --- | --- | --- |
| GET | `/elections` | Eventos visibles (`open`, `closed`, `published`) |
| GET | `/elections/{electionId}` | Evento con sus categorias y nominados embebidos |
| GET | `/elections/{electionId}/categories/{categoryId}/nominees` | Nominados de una categoria |

Respuesta de ejemplo de `GET /elections/{id}`:

```json
{
  "id": "premios-2026",
  "name": "Premios 2026",
  "status": "open",
  "closesAt": "2026-11-30T23:59:00Z",
  "categories": [
    {
      "id": "mejor-pelicula",
      "name": "Mejor Pelicula",
      "votingMethod": "ranked",
      "nominees": [{ "id": "n1", "name": "The Godfather" }]
    }
  ]
}
```

### Votos

| Metodo | Ruta | Descripcion |
| --- | --- | --- |
| GET | `/me` | Usuario actual y sus grupos |
| GET | `/me/elections/{electionId}/ballots` | Mis papeletas en el evento (progreso) |
| PUT | `/elections/{electionId}/categories/{categoryId}/ballot` | Crea o reemplaza mi voto |
| DELETE | `/elections/{electionId}/categories/{categoryId}/ballot` | Retira mi voto (solo con evento `open`) |

Body del `PUT`: `{ "nomineeId": "n3" }` para plurality o `{ "ranking": ["n2", "n1", "n3"] }` para ranked.

Validaciones del servidor (no confiar en el cliente):
- El evento esta `open` y dentro de `opensAt`/`closesAt`.
- El `userId` sale del token, nunca del body.
- `nomineeId` / `ranking` pertenecen a la categoria; el ranking no tiene repetidos.
- El tipo de body corresponde al `votingMethod` de la categoria.

### Resultados

| Metodo | Ruta | Descripcion |
| --- | --- | --- |
| GET | `/elections/{electionId}/results?groupId=` | Ganador por categoria (global o de un grupo) |
| GET | `/elections/{electionId}/categories/{categoryId}/results?groupId=` | Detalle: conteo o rondas de eliminacion |

Visibles para votantes solo con estado `published`; los admin pueden verlos siempre.

Respuesta de ejemplo para una categoria `ranked`:

```json
{
  "categoryId": "mejor-pelicula",
  "groupId": null,
  "totalBallots": 120,
  "winners": ["n2"],
  "rounds": [
    { "round": 1, "tally": { "n1": 40, "n2": 38, "n3": 30, "n4": 12 }, "activeBallots": 120, "eliminated": ["n4"] },
    { "round": 2, "tally": { "n1": 44, "n2": 45, "n3": 31 }, "activeBallots": 120, "eliminated": ["n3"] },
    { "round": 3, "tally": { "n1": 55, "n2": 63 }, "activeBallots": 118, "eliminated": [] }
  ]
}
```

### Administracion (rol `admin`)

| Metodo | Ruta | Descripcion |
| --- | --- | --- |
| POST / PATCH | `/elections`, `/elections/{id}` | Crear / editar evento |
| POST | `/elections/{id}/open` · `/close` · `/publish` | Transiciones de estado |
| POST / PATCH / DELETE | `/elections/{id}/categories[/{catId}]` | Categorias (solo en `draft`) |
| POST / PATCH / DELETE | `/categories/{catId}/nominees[/{nomineeId}]` | Nominados (solo en `draft`) |
| GET / POST / PATCH | `/groups`, `/groups/{id}` | Grupos |
| PUT / DELETE | `/groups/{id}/members/{userId}` | Membresias |
| GET | `/elections/{id}/participation?groupId=` | Cuantos votaron por categoria (sin revelar votos) |

## 6. Algoritmos de conteo (`packages/voting-core`)

Funciones puras que no mutan su entrada:

```ts
tallyPlurality(nominees: string[], ballots: { nomineeId: string }[]): PluralityResult
tallyInstantRunoff(nominees: string[], ballots: { ranking: string[] }[]): RunoffResult
```

**Plurality:** contar, ordenar; si hay empate en el primer lugar se informan todos como ganadores
(en los Oscar existen empates).

**Instant runoff:**
1. Cada papeleta cuenta para su preferencia mas alta *entre los nominados que siguen en carrera*
   (se salta los eliminados sin modificar la papeleta).
2. Papeletas sin preferencias restantes quedan *agotadas* y salen del denominador.
3. Si un nominado tiene > 50% de las papeletas activas, gana.
4. Si no, se elimina al de menos votos. Desempate para el ultimo lugar: menos votos en la ronda
   anterior, luego menos menciones totales en cualquier posicion, luego orden fijo por id (documentado
   y reportado en `rounds`).
5. Si todos los restantes estan empatados, se declaran co-ganadores.

Para resultados por grupo se filtran las papeletas por los `userId` del grupo y se llama la misma
funcion.

Casos de prueba minimos: ganador en primera ronda, varias rondas, papeletas parciales/agotadas,
empate en el ultimo lugar, empate final, cero papeletas, una sola papeleta, nominado sin votos de
primera preferencia.

## 7. Fases de desarrollo

### Fase 0 — Limpieza y base (1–2 dias) — hecha
Pendiente: regenerar `package-lock.json` con `npm install` para la nueva estructura de workspaces.

- Quitar restos del template (`counter`, `HelloWorld`, textos de Home/About).
- Unificar script `dev` y actualizar README con el proposito real del proyecto.
- Reestructurar a npm workspaces (`apps/web`, `apps/api`, `packages/voting-core`).
- Agregar Vitest y ejecutar `lint`, `check` y `test` en CI antes del deploy.

### Fase 1 — Nucleo de conteo (2–3 dias)
- Implementar `voting-core` (tipos + `tallyPlurality` + `tallyInstantRunoff`) con la suite de tests.
- Reemplazar `finishVoting` por una llamada a `tallyInstantRunoff` (corrige los bugs de la seccion 2).

### Fase 2 — Backend MVP (1 semana)
- Handlers Lambda con router liviano (p. ej. Hono) y validacion con Zod.
- Capa de repositorios con dos implementaciones: memoria (dev/tests) y DynamoDB.
- Endpoints de lectura de eventos/categorias/nominados y `PUT`/`GET` de papeletas.
- Script de seed con un evento de ejemplo (categorias plurality y ranked).
- Desarrollo local: `sam local start-api` o servidor Node con el mismo router + DynamoDB Local.

### Fase 3 — Usuarios y autenticacion (3–4 dias)
- User Pool de Cognito, login con Hosted UI o Amplify Auth en el frontend.
- Autorizador JWT en API Gateway; grupo `admin` de Cognito para rutas de administracion.
- Endpoint `/me`.

### Fase 4 — Grupos y resultados (1 semana)
- CRUD de grupos y membresias.
- Transiciones `open → closed → published`; al cerrar, foto de membresias y calculo de resultados
  (global + por grupo) guardados como `Result`.
- Endpoints de resultados y de participacion.

### Fase 5 — Frontend conectado (1–2 semanas)
- Cliente HTTP tipado (tipos de `voting-core`), manejo de errores y estados de carga.
- Reemplazar stores mock por stores que consumen la API (`elections`, `ballots`, `auth`).
- Vistas:
  - Lista de eventos y detalle con progreso ("votaste 5 de 12 categorias").
  - Voto plurality (tarjetas seleccionables).
  - Voto ranked reutilizando `MovieList` (drag & drop + alternativa con botones subir/bajar por
    accesibilidad y uso en movil).
  - Resultados con selector de grupo y visualizacion de rondas del runoff.
  - Panel admin: eventos, categorias, nominados, grupos, abrir/cerrar/publicar.
- Guardas de ruta por autenticacion y rol.

### Fase 6 — Infraestructura y despliegue (en paralelo desde Fase 2)
- `infra/cloudformation/api.yaml` (SAM): HTTP API, Lambdas, tabla DynamoDB con GSI1, Cognito.
- CloudFront con un segundo origen `/api/*` hacia API Gateway (mismo dominio, sin CORS).
- Parametro de ambiente (`dev` / `prod`) y nombres de stack propios del proyecto.
- Pipeline: lint + check + test → build → deploy infra → deploy web.

### Fase 7 — Endurecimiento antes de usar en serio
- Escritura idempotente de papeletas y cierre por hora del servidor.
- Votos secretos: ningun endpoint expone el voto de otro usuario, ni siquiera a admin.
- Log de auditoria (quien voto y cuando, sin el contenido) y throttling en API Gateway.
- Pruebas E2E del flujo completo (Playwright).

## 8. Decisiones pendientes

1. **Quien puede votar:** registro abierto, por invitacion o lista cargada por el admin.
2. **Grupos:** los asigna el admin o el usuario se une con un codigo de invitacion.
3. **Ranking parcial:** permitir ordenar solo algunos nominados (propuesta: si, minimo 1) o exigir
   ordenarlos todos como en la Academia.
4. **Cambiar el voto:** permitir editar hasta el cierre (propuesta: si).
5. **Base de datos:** DynamoDB (propuesta) o PostgreSQL.

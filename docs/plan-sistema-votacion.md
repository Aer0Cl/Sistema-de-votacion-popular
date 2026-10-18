# Plan de desarrollo: Sistema de votacion popular (estilo Oscar)

## 1. Objetivo

Sistema web donde los usuarios responden categorias al estilo de los premios Oscar, dentro de
una o mas **votaciones**:

- **Mayoria simple (plurality):** cada votante elige un nominado; gana el que tenga mas votos.
- **Voto preferencial (ranking / instant runoff):** cada votante ordena los nominados; se cuentan
  primeras preferencias y, si nadie supera el 50% de las papeletas activas, se elimina al ultimo y
  sus votos pasan a la siguiente preferencia. Ej: Mejor pelicula (asi lo hace la Academia).

El metodo de cada categoria lo define el backend y llega junto con la categoria.

## 2. Reglas de negocio

1. **Catalogo:** las categorias salen de `docs/Categorias Oscar.txt` (24). Los nominados de una
   categoria son los mismos en todas las votaciones.
2. **Votacion:** tiene un identificador de 6–8 caracteres alfanumericos para inscribirse, un nombre
   para mostrar elegido por el administrador, una fecha de termino y entre 2 y 24 categorias.
3. **Solo los administradores** crean votaciones. Quien la crea queda como su administrador.
4. **Respuesta unica por usuario y categoria:** si un usuario participa en varias votaciones, su
   respuesta a una categoria es la misma en todas. Al cambiarla, el cambio aplica a todas sus
   votaciones abiertas que incluyan esa categoria.
5. **Cierre:** en la fecha de termino se toma una **foto** de las respuestas de los participantes.
   Los cambios posteriores no la afectan, y el usuario puede seguir respondiendo en sus otras
   votaciones abiertas.
6. Una categoria solo se puede responder si el usuario participa en al menos una votacion abierta
   que la incluya.
7. No se puede unir a una votacion cerrada.
8. **Resultados:** visibles solo para los administradores de la votacion (parciales mientras esta
   abierta, definitivos desde la foto de cierre).
9. **Catalogo:** los administradores crean, editan y eliminan categorias, y crean y editan
   nominados. **Los nominados no se eliminan.** Editar nombres (de categorias y nominados) se
   permite siempre. Mientras la categoria no se use en ninguna votacion (abierta o cerrada) tambien
   se puede cambiar su metodo, agregarle nominados o eliminarla (con sus nominados); una vez en uso
   eso queda bloqueado, porque cambiaria respuestas guardadas. Una categoria necesita al menos 2
   nominados para elegirse en una votacion.
10. **Abandonar:** un participante puede abandonar una votacion abierta. Sus respuestas se
    conservan (son compartidas con sus otras votaciones) pero dejan de contar en esa. Puede volver
    a unirse mientras siga abierta. Un administrador que abandona sigue viendola como admin.
11. **Ranking completo:** en categorias de ranking hay que ordenar a todos los nominados. No hay
    rankings parciales por ahora; la regla esta en `REQUIRE_COMPLETE_RANKING` (`voting-core`) por si
    se habilitan en el futuro (el conteo ya maneja papeletas agotadas).
12. **Usuarios:** su creacion y autenticacion quedan a cargo de los servicios de AWS (Cognito); se
    definira mas adelante. Mientras tanto el front usa un selector de usuario de prueba.

### Ejemplo del cierre

Ana participa en A (cierra el 1-mar) y B (cierra el 10-mar); ambas incluyen Mejor pelicula.

| Fecha | Accion | A | B |
| --- | --- | --- | --- |
| 20-feb | Ana ordena X > Y > Z | X > Y > Z | X > Y > Z |
| 1-mar | A cierra: foto | **X > Y > Z** (fija) | X > Y > Z |
| 5-mar | Ana cambia a Y > X > Z | X > Y > Z | Y > X > Z |

### Como se implementa la foto

Cada guardado agrega una **version** de la respuesta (historial, nunca se sobrescribe). La foto de
una votacion es, para cada participante y categoria, la ultima version guardada **antes** de la
fecha de termino (`snapshotAnswers` en `voting-core`). Asi, aunque el proceso que toma la foto
corra unos segundos tarde, un cambio hecho despues del cierre no entra en la votacion cerrada.

## 3. Estado actual

| Area | Estado |
| --- | --- |
| `packages/voting-core` | Tipos de dominio, conteo (`tallyPlurality`, `tallyInstantRunoff`, `tallyElection`), reglas (`validateNewElection`, `validateAnswerChoice`, `snapshotAnswers`, codigos). 43 tests |
| `apps/web` | Pantallas de votaciones sobre una **API simulada en memoria** (`src/api/mockApi.ts`) con las mismas reglas que tendra el backend. 7 tests |
| `apps/api` | Solo un endpoint de salud |
| Infra | CloudFormation para el sitio estatico; el workflow de deploy esta comentado |

## 4. Arquitectura propuesta

```
 Navegador (Vue SPA)
      |  HTTPS + JWT
      v
 CloudFront ──> S3 (frontend estatico)
      |
      └──> API Gateway (HTTP API) ──> Lambda (Node 22 + TS) ──> DynamoDB
                    |                        ^
               Cognito (grupo "admin")       |
                                   EventBridge Scheduler (foto al cierre)
```

Estructura de repositorio (npm workspaces):

```
apps/web/              frontend
apps/api/              handlers Lambda, validacion, repositorios
packages/voting-core/  tipos + reglas + conteo, compartido por web y api
```

## 5. Modelo de datos

Definido en `packages/voting-core/src/types.ts`:

| Entidad | Campos principales |
| --- | --- |
| `Category` | `id`, `name`, `votingMethod` (`plurality` / `ranked`) |
| `Nominee` | `id`, `categoryId`, `name`, `description?`, `imageUrl?` |
| `Election` | `id`, `code`, `name`, `closesAt`, `categoryIds[]`, `adminIds[]`, `createdAt` |
| `ElectionMembership` | `electionId`, `userId`, `joinedAt` |
| `User` | `id`, `displayName`, `role` (`voter` / `admin`) |
| `Answer` | `userId`, `categoryId`, `nomineeId` o `ranking[]`, `updatedAt` (cada guardado es una version) |
| `ElectionSnapshot` | `electionId`, `takenAt`, `answers[]` |

El estado de una votacion (`open` / `closed`) se deriva de `closesAt`.

### Diseño DynamoDB (tabla unica)

| Entidad | PK | SK |
| --- | --- | --- |
| Category | `CATALOG` | `CATEGORY#<id>` |
| Nominee | `CATEGORY#<id>` | `NOMINEE#<id>` |
| Election | `ELECTION#<code>` | `META` |
| Membership | `ELECTION#<code>` | `MEMBER#<userId>` (GSI1: `USER#<userId>` / `ELECTION#<code>`) |
| Answer (actual) | `USER#<userId>` | `ANSWER#<categoryId>` |
| Answer (version) | `USER#<userId>` | `ANSWER#<categoryId>#<updatedAt>` |
| Snapshot | `ELECTION#<code>` | `SNAPSHOT` (o una fila por respuesta si crece) |

## 6. API REST

El contrato esta en `apps/web/src/api/types.ts` (`VotingApi`); la API simulada lo implementa
y la API real debe respetarlo. Todas las rutas requieren JWT; prefijo `/api/v1`.

| Metodo | Ruta | Quien | Descripcion |
| --- | --- | --- | --- |
| GET | `/me` | todos | Usuario actual |
| GET | `/me/elections` | todos | Votaciones donde participo o que administro |
| GET | `/elections/{code}/preview` | todos | Nombre, cierre y cantidad de categorias, antes de unirse |
| POST | `/elections/{code}/join` | todos | Unirse (409 si esta cerrada) |
| GET | `/elections/{code}` | participantes y admins | Detalle con categorias, metodo y nominados; mis respuestas (actuales si esta abierta, de la foto si esta cerrada) |
| DELETE | `/elections/{code}/membership` | participantes | Abandonar (409 si esta cerrada) |
| POST | `/elections` | admins | Crear votacion; el servidor genera el codigo |
| GET | `/admin/catalog` | admins | Categorias con nominados, cantidad de votaciones que las usan y si estan bloqueadas |
| POST | `/admin/categories` | admins | Crear categoria `{ name, votingMethod }` |
| PATCH | `/admin/categories/{id}` | admins | Editar nombre y metodo (cambiar el metodo da 409 si esta en uso) |
| DELETE | `/admin/categories/{id}` | admins | Eliminar con sus nominados (409 si esta en uso) |
| POST | `/admin/categories/{id}/nominees` | admins | Agregar nominado (409 si la categoria esta en uso) |
| PATCH | `/admin/nominees/{id}` | admins | Editar nombre / descripcion (los nominados no se eliminan) |
| GET | `/me/answers` | todos | Mis respuestas actuales |
| PUT | `/me/answers/{categoryId}` | todos | Guardar respuesta: `{ "nomineeId" }` o `{ "ranking": [...] }` |
| GET | `/elections/{code}/results` | admins de la votacion | Resultados parciales o de la foto de cierre |

Validaciones del servidor: el `userId` sale del token; la respuesta corresponde al metodo de la
categoria; el usuario participa en una votacion abierta con esa categoria (regla 6).

## 7. Algoritmos de conteo

- **Plurality:** gana el de mas votos; un empate en el primer lugar da co-ganadores.
- **Instant runoff:** cada papeleta cuenta para su preferencia mas alta que siga en carrera; las
  papeletas sin preferencias restantes salen del denominador; gana quien supere el 50% de las
  activas. Desempate para el ultimo lugar: menos votos en rondas anteriores, luego menos menciones
  totales, luego orden de id. Si todos los restantes empatan, co-ganadores.

## 8. Fases de desarrollo

### Fase 0 — Limpieza y base — hecha
Workspaces, Vitest, README, CI con lint/check/test.

### Fase 1 — Nucleo de conteo — hecha
`tallyPlurality`, `tallyInstantRunoff` y sus tests.

### Fase 1b — Modelo de votaciones y frontend sobre API simulada — hecha
- Reglas y tipos en `voting-core` (seccion 2 y 5).
- Pantallas: mis votaciones + unirse por codigo, crear votacion (admin), responder categorias de
  una votacion, resultados (admin de la votacion).
- Selector de "usuario de prueba" en la barra mientras no hay autenticacion.
- Datos de ejemplo: 3 votaciones (una ya cerrada) y 4 usuarios en `apps/web/src/api/seed.ts`.

### Fase 2 — Backend MVP
- Handlers Lambda (Hono) con validacion (Zod) que implementan la tabla de la seccion 6 usando las
  reglas de `voting-core`.
- Repositorios: memoria (tests) y DynamoDB.
- Historial de respuestas y foto de cierre: EventBridge Scheduler programa la foto en `closesAt`;
  como respaldo, la foto se toma al primer acceso a una votacion cerrada que no la tenga.
- Seed con el catalogo de 24 categorias y sus nominados.
- Cliente HTTP en el front que implemente `VotingApi`, elegido por variable de entorno.

### Fase 3 — Autenticacion
- Cognito; grupo `admin` para crear votaciones.
- Reemplazar el selector de usuario de prueba por login.

### Fase 4 — Infraestructura y despliegue
- `infra/cloudformation/api.yaml` (SAM): HTTP API, Lambdas, DynamoDB, Cognito, Scheduler.
- CloudFront con origen `/api/*` hacia API Gateway.
- Reactivar el workflow con ambientes dev / qa / prod.

### Fase 5 — Endurecimiento
- Pruebas E2E del flujo completo (Playwright).
- Votos secretos: ningun endpoint expone respuestas individuales de otros usuarios.
- Throttling y log de auditoria.

### Fase 1c — Catalogo y abandonar votacion — hecha
- Vista `/admin/catalogo` para crear, editar y eliminar categorias y crear y editar nominados
  (reglas 9 y 11).
- Boton "Abandonar votacion" (regla 10).

## 9. Decisiones pendientes

1. **Administradores adicionales:** ¿puede el creador agregar otros administradores a su votacion?
2. **Usuarios con Cognito:** registro (abierto o por invitacion), como se asigna el rol `admin`.

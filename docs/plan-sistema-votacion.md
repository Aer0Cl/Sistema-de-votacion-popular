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
| `packages/voting-core` | Tipos, reglas y conteo en TypeScript para el front. 51 tests |
| `apps/web` | Pantallas completas. Usa la API simulada en memoria, o el backend real si se define `VITE_API_URL`. 22 tests |
| `apps/api` | Backend en Python (Lambda): reglas, conteo, repositorios en memoria y DynamoDB, rutas HTTP. 78 tests (los del servicio corren tambien contra DynamoDB simulado con moto) |
| `infra/cdk` | CDK en TypeScript: tablas, Lambdas, HTTP API, logs, alarmas y panel. 9 tests; `cdk synth --strict` pasa cdk-nag |
| `infra/cloudformation` | Sitio estatico (S3 + CloudFront); el workflow de deploy esta comentado |

## 4. Arquitectura

```
 Navegador (Vue SPA)
      |  HTTPS (+ JWT cuando se integre Cognito)
      v
 API Gateway (HTTP API, /api/v1/*)  -- logs de acceso --> CloudWatch Logs
      |
      v
 Lambda votacion-<stage>-api (Python 3.14, ARM64, Powertools) --> DynamoDB (8 tablas)
                                                    |
 EventBridge (cada 5 min) --> Lambda votacion-<stage>-snapshots   +--> CloudWatch Logs (JSON)
                                                                      alarmas + panel
```

Estructura de repositorio (npm workspaces; `apps/api` delega en `uv`):

```
apps/web/              frontend Vue
apps/api/              Lambda en Python (uv, pytest, ruff)
packages/voting-core/  tipos + reglas + conteo en TypeScript (lo usa el front)
infra/cdk/             infraestructura del backend (CDK)
```

**Reglas duplicadas:** el backend es Python y el front TypeScript, asi que las reglas y el conteo
existen en `voting-core` y en `apps/api/src/votacion_api/domain/`. Los tests de ambos cubren los
mismos casos para mantenerlos alineados; la validacion que cuenta es la del backend.

### Seguimiento en CloudWatch

- **Logs de las Lambdas** (`/aws/lambda/votacion-<stage>-api` y `-snapshots`): JSON estructurado con
  `correlation_id` (id del request de API Gateway), `userId` y un campo `action` por operacion
  (`answer.saved`, `election.created`, `membership.joined`, `snapshot.taken`, `category.*`,
  `nominee.*`, ...). Nunca registran el contenido de un voto.
- **Logs de acceso de API Gateway** (`/aws/apigateway/votacion-<stage>-api`): metodo, ruta, estado,
  latencia y errores de integracion por request.
- Retencion: 2 semanas en dev, 3 meses en prod.
- **Alarmas** (sin destino de notificacion todavia): errores de cada Lambda y respuestas 5xx.
- **Panel** `votacion-<stage>-backend`: solicitudes, errores, latencia y fotos de cierre.

Ejemplo en Logs Insights: `fields @timestamp, action, userId, electionCode | filter ispresent(action)`.

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

### Tablas DynamoDB

Una tabla por entidad (`infra/cdk/lib/data-stack.ts`), bajo demanda, con PITR y cifrado. Nombres
`votacion-<stage>-<tabla>`. En prod tienen proteccion contra borrado y se conservan al destruir
el stack.

| Tabla | Clave de particion | Clave de orden | Indice |
| --- | --- | --- | --- |
| `users` | `id` | | |
| `categories` | `id` | | |
| `nominees` | `id` | | `byCategory`: `categoryId` + `createdAt` |
| `elections` | `code` | | |
| `memberships` | `electionCode` | `userId` | `byUser`: `userId` + `electionCode` |
| `answers` (respuesta actual) | `userId` | `categoryId` | |
| `answerHistory` (registro de votos) | `userCategory` | `version` (`<updatedAt>#<sufijo>`) | |
| `snapshots` (fotos de cierre) | `electionCode` | `userCategory` | |

Guardar una respuesta escribe `answers` y `answerHistory` en una transaccion. La foto consulta,
por participante y categoria, la ultima version con `version < closesAt`; por eso las fechas se
guardan siempre en UTC con milisegundos (`2027-03-01T00:00:00.000Z`).

**Limites conocidos del MVP:** listar votaciones y catalogo usa `Scan` y la foto hace una consulta
por participante y categoria. Alcanza para cientos de votaciones y participantes; si crece, agregar
indices por administrador y paralelizar la foto.

### Identidad

Hasta integrar Cognito, el usuario llega en el encabezado `X-User-Id` (`AUTH_MODE=dev-header`), y
solo existen los usuarios de prueba de la tabla `users`. **Cualquiera puede hacerse pasar por otro
usuario**, por eso `infra/cdk/lib/app.ts` impide sintetizar el stage `prod`. Con Cognito, la Lambda
lee el claim `sub` del JWT (`AUTH_MODE=jwt`, ya implementado) y API Gateway valida el token.

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

### Fase 2 — Backend MVP — hecha (sin desplegar)
- Lambda en Python con AWS Lambda Powertools (rutas de la seccion 6, logs estructurados).
- Repositorios en memoria y DynamoDB; los tests del servicio corren contra ambos (moto).
- Foto de cierre: regla de EventBridge cada 5 minutos + respaldo al primer acceso. Como la foto
  solo usa versiones anteriores al cierre, el retraso no altera el resultado.
- Carga inicial (`python -m votacion_api.seed`): 24 categorias, nominados genericos y usuarios de
  prueba; no sobrescribe datos existentes.
- CDK (`infra/cdk`): stacks `Votacion-dev-Data` y `Votacion-dev-Api`, cdk-nag (AwsSolutions).
- Cliente HTTP en el front (`apps/web/src/api/httpApi.ts`), activado con `VITE_API_URL`.
- Pendiente: primer despliegue y prueba de punta a punta contra AWS.

### Fase 3 — Autenticacion
- Cognito (los usuarios los gestionan los servicios de AWS); grupo `admin` para crear votaciones.
- Autorizador JWT en el HTTP API y `AUTH_MODE=jwt` en la Lambda; quitar `/dev/users` y el
  selector de usuario de prueba.
- Recien entonces habilitar el stage `prod`.

### Fase 4 — Infraestructura y despliegue
- Destino de notificacion (SNS / correo) para las alarmas.
- CloudFront con origen `/api/*` hacia API Gateway (mismo dominio, sin CORS).
- Reactivar el workflow con ambientes dev / qa / prod, agregando `cdk deploy` y los tests de
  Python (requiere `uv` en CI).

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

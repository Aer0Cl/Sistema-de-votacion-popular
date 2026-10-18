# Sistema de votacion popular

Aplicacion web para votaciones al estilo de los premios Oscar: algunas categorias se
deciden por mayoria simple y otras, como Mejor Pelicula, por ranking de preferencias
(segunda vuelta instantanea). Cada voto se asocia a un usuario y los resultados se
calculan por votacion.

> La documentacion detallada (plan, arquitectura, front, back e infraestructura) vive en `docs/`,
> que es local y no se versiona (ver `.gitignore`). Este README resume lo necesario para
> desarrollar, desplegar y probar.

## Reglas principales

- Cada votacion tiene un nombre visible, un codigo de 8 caracteres para inscribirse, una fecha
  de cierre y entre 2 y 24 categorias del catalogo. Solo los administradores las crean.
- Un usuario puede participar en varias votaciones y tiene **una respuesta por categoria**,
  compartida por todas sus votaciones abiertas. Al cerrar una votacion se toma una foto de las
  respuestas; el usuario sigue cambiandolas en sus otras votaciones abiertas.
- El tipo de votacion (mayoria o ranking) viene con la categoria. En ranking se ordenan todos los
  nominados. Los resultados solo los ven los administradores de la votacion.
- Los administradores crean, editan y eliminan categorias; los nominados se editan pero no se
  eliminan. Un usuario puede abandonar una votacion mientras este abierta.

## Stack

- Frontend: Vue 3 + TypeScript + Vite, Vue Router y Pinia
- Backend: AWS Lambda en Python 3.14 (Powertools), API Gateway HTTP API y DynamoDB
- Infraestructura con AWS CDK (TypeScript) + cdk-nag, que genera los stacks de CloudFormation;
  logs, alarmas y panel en CloudWatch
- Acceso a AWS sin llaves: IAM Identity Center (personas) y OIDC (GitHub Actions)
- Pruebas con Vitest (TypeScript) y pytest + moto (Python)
- CI/CD con GitHub Actions; ESLint + Prettier

## Estructura del proyecto (npm workspaces)

```text
.
|-- apps/
|   |-- web/              # frontend Vue (@votacion/web)
|   `-- api/              # Lambda en Python, proyecto uv (@votacion/api delega en uv)
|-- packages/
|   `-- voting-core/      # tipos, reglas y conteo en TypeScript para el front
|-- infra/
|   |-- cdk/              # stacks Data, Web y Api (@votacion/infra)
|   `-- cloudformation/
|       `-- dev-access.yaml   # acceso (Identity Center y OIDC de GitHub) y permisos de CDK
|-- scripts/
|   `-- deploy-aws.ps1    # despliegue local: CDK, build del front, s3 sync, invalidacion
|-- .github/workflows/
|   |-- deploy-aws.yml            # verificaciones y despliegue
|   `-- invalidate-cloudfront.yml # invalidacion manual de la cache del front
`-- package.json          # raiz de los workspaces
```

`voting-core` se publica como codigo fuente TypeScript (`exports` apunta a `src/index.ts`) y lo
compila directamente Vite en `web`. El backend en Python no lo usa: tiene un port de las mismas
reglas en `apps/api/src/votacion_api/domain/`.

## Arquitectura en AWS

```text
Navegador -> CloudFront -> S3 privado (apps/web/dist)          stack Votacion-<stage>-Web
Navegador -> API Gateway HTTP API /api/v1/* -> Lambda API      stack Votacion-<stage>-Api
EventBridge (cada 5 min) -> Lambda de fotos de cierre
Lambdas -> DynamoDB (8 tablas)                                 stack Votacion-<stage>-Data
```

| Stack                   | Recursos                                                                                                                                                                    |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Votacion-<stage>-Data` | Tablas `votacion-<stage>-*` bajo demanda, con PITR y cifrado                                                                                                                |
| `Votacion-<stage>-Web`  | Bucket `votacion-<stage>-web-<cuenta>` privado, CloudFront con OAC y HTTPS; las rutas del router responden con `index.html`                                                 |
| `Votacion-<stage>-Api`  | Lambdas `votacion-<stage>-api` y `-snapshots`, HTTP API con CORS para el dominio de CloudFront, regla de EventBridge, logs, 3 alarmas y el panel `votacion-<stage>-backend` |

Salidas que usan los despliegues: `WebUrl`, `WebBucketName` y `DistributionId` (Web) y `ApiUrl`
(Api). Solo existe el stage `dev`: `prod` esta bloqueado hasta integrar Cognito.

## Requisitos

- Node.js 20+ y npm 10+
- [uv](https://docs.astral.sh/uv/) para el backend en Python (instala Python 3.14 si falta)
- AWS CLI v2, con un perfil de IAM Identity Center para desplegar

## Comandos

Desde la raiz del repositorio:

```bash
npm install
npm run dev            # servidor de desarrollo del frontend
npm run lint
npm run check          # tipos (TS) y ruff (Python) en todos los workspaces
npm test               # pruebas de todos los workspaces, incluido pytest
npm run build
npm run format
npm run preview
npm run deploy:aws     # despliegue local en dev (ver "Despliegue")
```

Para correr un comando en un solo workspace: `npm run test -w @votacion/api`. Primera vez en
`apps/api`: `uv sync`.

Sin `VITE_API_URL` el front usa una API simulada en memoria, asi que no hace falta el backend
para desarrollar las pantallas. Para usar el backend desplegado, copiar
`apps/web/.env.example` a `apps/web/.env.local` con la salida `ApiUrl`.

## Acceso a AWS (dev)

Nadie usa llaves de acceso. La plantilla
[`infra/cloudformation/dev-access.yaml`](infra/cloudformation/dev-access.yaml) (stack
`votacion-dev-access`, ya desplegado) crea:

| Recurso                                                                   | Para que                                                                                                             |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Grupo `votacion-dev-developers` y permission set `Votacion-dev-Developer` | Desarrolladores por Identity Center, sesiones de 8 h: desplegar, cargar el seed, leer logs, alarmas y panel          |
| Proveedor OIDC de GitHub y rol `votacion-dev-github-deploy`               | GitHub Actions; solo lo asumen los jobs del environment `dev` de este repositorio                                    |
| `votacion-dev-deploy`                                                     | Permisos de despliegue compartidos: roles de CDK, leer stacks, subir el front e invalidar CloudFront                 |
| `votacion-dev-cdk-execution`                                              | Politica del rol de ejecucion de CloudFormation (en lugar de `AdministratorAccess`), solo para recursos del proyecto |
| `votacion-dev-app-boundary`                                               | Limite de permisos que CDK aplica a todos sus roles                                                                  |

**Administrador, una vez** (y cada vez que cambie la plantilla):

```bash
aws sso-admin list-instances   # InstanceArn e IdentityStoreId
aws cloudformation deploy --stack-name votacion-dev-access --template-file infra/cloudformation/dev-access.yaml --capabilities CAPABILITY_NAMED_IAM --parameter-overrides IdentityCenterInstanceArn=<InstanceArn> IdentityStoreId=<IdentityStoreId>
cd infra/cdk && npx cdk bootstrap --cloudformation-execution-policies arn:aws:iam::<cuenta>:policy/votacion-dev-cdk-execution --termination-protection
```

**Por cada desarrollador:**

1. En la consola de IAM Identity Center, crear el usuario y agregarlo al grupo
   `votacion-dev-developers` (recibe un correo para activar la cuenta y MFA).
2. `aws configure sso --profile votacion-dev` y elegir el permission set `Votacion-dev-Developer`.
3. `aws sso login --profile votacion-dev` antes de desplegar o cargar datos.

**GitHub, una vez:** en Settings > Environments crear el environment `dev`, limitar sus
"Deployment branches" a las ramas que pueden desplegar (`main` y `feature/*`) y definir la variable
`AWS_DEPLOY_ROLE_ARN` con la salida `GitHubDeployRoleArn` del stack `votacion-dev-access`.

Si un despliegue falla con `AccessDenied`, agregar la accion puntual a la politica que
corresponda en `dev-access.yaml` y volver a desplegar la plantilla con credenciales de
administrador.

## Despliegue

Todos los caminos hacen lo mismo: `cdk deploy --all` (stacks Data, Web y Api), compilan el front
con `ApiUrl` como `VITE_API_URL`, lo suben al bucket del stack Web (assets con cache larga,
`index.html` sin cache) e invalidan CloudFront.

| Como                          | Cuando                                                                                                                                                                 |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Push a `main` o a `feature/*` | Automatico en dev: workflow `deploy-aws.yml`, despues de lint, tipos, pruebas y `cdk synth --strict`. Todas las ramas comparten dev: queda el ultimo push              |
| Manual en GitHub              | Actions > **CI y despliegue en AWS** > Run workflow: la rama se elige en "Use workflow from" y el ambiente en la lista. La rama debe estar permitida en el environment |
| Local                         | `npm run deploy:aws` con la sesion de `votacion-dev` (`scripts/deploy-aws.ps1 -AwsProfile <perfil> -Stage <stage>`)                                                    |

Cada PR a `main` corre las verificaciones sin desplegar. Despues de desplegar, el workflow prueba
`GET /health` (si falla, el despliegue falla) y el resumen muestra la rama, el commit, las URLs
del front y la API, y la tabla de endpoints con su URL completa. La tabla sale de las rutas de
`apps/api/src/votacion_api/app.py`, asi que incluye cada endpoint nuevo sin tocar el workflow.

**Invalidar la cache del front sin desplegar:** Actions > **Invalidar cache del front** > Run
workflow, eligiendo el ambiente y las rutas (por defecto `/*`). Espera a que la invalidacion
termine.

## Probar la aplicacion desplegada

1. **URL:** la muestra el resumen del workflow, el enlace del environment `dev` en Deployments, o:

   ```bash
   aws cloudformation describe-stacks --stack-name Votacion-dev-Web --profile votacion-dev --query "Stacks[0].Outputs[?OutputKey=='WebUrl'].OutputValue" --output text
   ```

2. **Datos iniciales**, una vez despues del primer despliegue (el workflow no los carga; no
   sobrescribe datos existentes):

   ```bash
   cd apps/api && AWS_PROFILE=votacion-dev uv run python -m votacion_api.seed --stage dev
   ```

   Crea el catalogo de categorias y nominados, y los usuarios de prueba Alice (admin), Bob,
   Carla y Diego.

3. **Flujo:** con el selector de usuario de la cabecera (solo dev):

   | Usuario           | Ruta                              | Que probar                                           |
   | ----------------- | --------------------------------- | ---------------------------------------------------- |
   | Alice             | `/admin/catalogo`                 | Editar categorias y nominados                        |
   | Alice             | `/votaciones/nueva`               | Crear una votacion y anotar su codigo                |
   | Bob, Carla, Diego | `/` y `/votaciones/<codigo>`      | Inscribirse con el codigo y votar                    |
   | Alice             | `/votaciones/<codigo>/resultados` | Ver resultados (solo administradores de la votacion) |

4. **API directa:** `curl <ApiUrl>/health` y `curl -H "x-user-id: u-alice" <ApiUrl>/me`.
5. **Logs:** panel `votacion-dev-backend` y grupos `/aws/lambda/votacion-dev-api` y
   `/aws/apigateway/votacion-dev-api` en CloudWatch.

> El stage dev identifica al usuario con el encabezado `X-User-Id` hasta integrar Cognito: la
> API es publica y cualquiera con la URL puede actuar como cualquier usuario. Usar solo datos de
> prueba.

## API (`<ApiUrl>` = `.../api/v1`)

Todas las rutas usan JSON e identifican al usuario con `X-User-Id` en dev. Los errores responden
`{"message": "..."}` con 400 (datos invalidos), 401 (usuario desconocido), 403 (sin permiso),
404 (no existe) o 409 (conflicto).

| Metodo y ruta                                                                                      | Quien                 | Para que                                            |
| -------------------------------------------------------------------------------------------------- | --------------------- | --------------------------------------------------- |
| `GET /health`                                                                                      | Cualquiera            | Estado de la API                                    |
| `GET /dev/users`                                                                                   | Cualquiera (solo dev) | Usuarios para el selector del front                 |
| `GET /me`, `GET /me/elections`, `GET /me/answers`                                                  | Usuario               | Perfil, votaciones y respuestas propias             |
| `PUT /me/answers/{categoryId}`                                                                     | Usuario               | Guardar respuesta (`nomineeId` o `ranking`)         |
| `GET /elections/{code}/preview`, `POST .../join`, `DELETE .../membership`, `GET /elections/{code}` | Usuario               | Ver, unirse, abandonar y votar                      |
| `POST /elections`, `GET /elections/{code}/results`                                                 | Admin                 | Crear votacion; resultados (admins de la votacion)  |
| `POST /admin/users`                                                                                | Admin                 | Alta de usuario o administrador                     |
| `GET /admin/catalog`                                                                               | Admin                 | Catalogo con nominados y uso en votaciones          |
| `POST /admin/categories`                                                                           | Admin                 | Crear categoria, con o sin nominados                |
| `PATCH`, `DELETE /admin/categories/{categoryId}`                                                   | Admin                 | Editar o eliminar categoria (sin uso en votaciones) |
| `POST /admin/categories/{categoryId}/nominees`                                                     | Admin                 | Asignar uno o varios nominados a una categoria      |
| `PATCH /admin/nominees/{nomineeId}`                                                                | Admin                 | Editar nominado (no se eliminan)                    |

**Alta de usuarios** (solo `displayName` es obligatorio; `role` es `voter` por defecto y el `id`
se genera desde el nombre si no se envia, p. ej. `u-eva-diaz`). Responde 201 con el usuario y 409
si el `id` ya existe:

```bash
curl -X POST <ApiUrl>/admin/users -H "x-user-id: u-alice" -H "content-type: application/json" \
  -d '{"displayName": "Eva Diaz"}'
curl -X POST <ApiUrl>/admin/users -H "x-user-id: u-alice" -H "content-type: application/json" \
  -d '{"displayName": "Fede", "role": "admin", "id": "u-fede"}'
```

**Categoria con o sin nominados** (`votingMethod`: `plurality` o `ranked`; `nominees` es
opcional y cada uno lleva `name` y `description` opcional):

```bash
curl -X POST <ApiUrl>/admin/categories -H "x-user-id: u-alice" -H "content-type: application/json" \
  -d '{"name": "Mejor sonido", "votingMethod": "plurality", "nominees": [{"name": "Dune", "description": "2021"}, {"name": "Oppenheimer"}]}'
```

**Asignar nominados a una categoria** (varios con `nominees`, o uno con `name` y `description`):

```bash
curl -X POST <ApiUrl>/admin/categories/mejor-sonido/nominees -H "x-user-id: u-alice" \
  -H "content-type: application/json" -d '{"nominees": [{"name": "Barbie"}, {"name": "Maestro"}]}'
```

Ambas responden 201 con la categoria y todos sus nominados en orden. Hasta 50 nominados por
solicitud; si uno no es valido (sin nombre o repetido en la categoria) no se guarda ninguno. No
se pueden agregar nominados a una categoria que ya se usa en una votacion (409). Una votacion
exige al menos 2 nominados por categoria.

## Pendiente

- Primer despliegue y prueba de punta a punta.
- Cognito y autorizador JWT; recien entonces habilitar `prod` (environment, stage de CDK y
  `dev-access.yaml`).
- Destino de notificacion para las alarmas.
- Origen `/api/*` en CloudFront para quitar CORS, y dominio propio con certificado de ACM.

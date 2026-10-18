# Sistema de votacion popular

Aplicacion web para votaciones al estilo de los premios Oscar: algunas categorias se
deciden por mayoria simple y otras, como Mejor Pelicula, por ranking de preferencias
(segunda vuelta instantanea). Cada voto se asocia a un usuario y los resultados se
pueden calcular por grupo de usuarios.

El plan de desarrollo esta en [docs/plan-sistema-votacion.md](docs/plan-sistema-votacion.md).

## Stack

- Frontend: Vue 3 + TypeScript + Vite, Vue Router y Pinia
- Backend: AWS Lambda en Python 3.14 (Powertools), API Gateway HTTP API y DynamoDB
- Infraestructura del backend con AWS CDK (TypeScript) + cdk-nag; logs, alarmas y panel en CloudWatch
- Pruebas con Vitest (TypeScript) y pytest + moto (Python)
- Sitio estatico con CloudFormation (S3 + CloudFront)
- CI/CD con GitHub Actions
- ESLint + Prettier

## Estructura del proyecto (npm workspaces)

```text
.
|-- apps/
|   |-- web/              # frontend Vue (@votacion/web)
|   `-- api/              # Lambda en Python, proyecto uv (@votacion/api delega en uv)
|-- packages/
|   `-- voting-core/      # tipos, reglas y conteo en TypeScript para el front
|-- infra/
|   |-- cdk/              # backend: DynamoDB, Lambdas, HTTP API, CloudWatch (@votacion/infra)
|   `-- cloudformation/
|       `-- static-site.yaml
|-- scripts/
|   `-- deploy-aws.ps1
|-- docs/
|-- .github/workflows/deploy-aws.yml
`-- package.json          # raiz de los workspaces
```

`voting-core` se publica como codigo fuente TypeScript (`exports` apunta a `src/index.ts`);
lo compilan directamente Vite en `web` y el empaquetador de Lambda en `api`.

## Requisitos

- Node.js 20+
- npm 10+
- [uv](https://docs.astral.sh/uv/) para el backend en Python (instala Python 3.14 si falta)
- AWS CLI v2 configurado para desplegar, con una cuenta inicializada con `cdk bootstrap`

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
```

Para correr un comando en un solo workspace: `npm run test -w @votacion/api`.

## Acceso al ambiente dev (IAM Identity Center)

Los desarrolladores entran con IAM Identity Center (credenciales temporales, sin llaves de
acceso) y permisos minimos: solo pueden desplegar a traves de los roles de CDK, cargar el
catalogo inicial y leer logs, alarmas y el panel. La plantilla
[`infra/cloudformation/dev-access.yaml`](infra/cloudformation/dev-access.yaml) crea:

- el grupo `votacion-dev-developers` y el permission set `Votacion-dev-Developer` (sesiones de 8 h)
  asignado a la cuenta;
- `votacion-dev-cdk-execution`: politica del rol de ejecucion de CloudFormation, en lugar de
  `AdministratorAccess`, que solo permite gestionar recursos del proyecto;
- `votacion-dev-app-boundary`: limite de permisos que CDK aplica a todos sus roles.

Configuracion inicial, una sola vez, **con credenciales de administrador**:

```bash
aws sso-admin list-instances   # InstanceArn e IdentityStoreId
aws cloudformation deploy --stack-name votacion-dev-access --template-file infra/cloudformation/dev-access.yaml --capabilities CAPABILITY_NAMED_IAM --parameter-overrides IdentityCenterInstanceArn=<InstanceArn> IdentityStoreId=<IdentityStoreId>
cd infra/cdk && npx cdk bootstrap --cloudformation-execution-policies arn:aws:iam::<cuenta>:policy/votacion-dev-cdk-execution --termination-protection
```

Por cada desarrollador:

1. En la consola de IAM Identity Center, crear el usuario y agregarlo al grupo
   `votacion-dev-developers`. Identity Center le envia un correo para activar la cuenta y MFA.
2. En su equipo, configurar el perfil (la URL de inicio esta en la configuracion de Identity
   Center) y elegir la cuenta y el permission set `Votacion-dev-Developer`:

   ```bash
   aws configure sso --profile votacion-dev
   ```

3. Usar el perfil para desplegar y cargar datos:

   ```bash
   aws sso login --profile votacion-dev
   cd infra/cdk && npx cdk deploy --all -c stage=dev --profile votacion-dev
   ```

Si un despliegue falla con `AccessDenied`, agregar la accion puntual a `votacion-dev-cdk-execution`
en la plantilla y volver a desplegarla con credenciales de administrador.

## Backend

Sin `VITE_API_URL` el front usa una API simulada en memoria, asi que no hace falta el backend
para desarrollar las pantallas.

Primera vez en `apps/api`: `uv sync` (crea `.venv` con las dependencias de `uv.lock`).

Desplegar el stage dev (el empaquetado de la Lambda usa uv, sin Docker):

```bash
cd infra/cdk
npx cdk bootstrap            # una vez por cuenta y region
npx cdk synth --strict       # sintetiza y aplica cdk-nag
npx cdk diff
npx cdk deploy --all -c stage=dev
```

Cargar el catalogo y los usuarios de prueba (no sobrescribe datos existentes):

```bash
cd apps/api
AWS_PROFILE=votacion-dev uv run python -m votacion_api.seed --stage dev
```

Luego copiar `apps/web/.env.example` a `apps/web/.env.local` con la salida `ApiUrl` del stack.

> El stage dev identifica al usuario con el encabezado `X-User-Id` hasta integrar Cognito: no
> exponerlo con datos reales. El stage `prod` esta bloqueado hasta entonces.

## Despliegue del sitio estatico (local)

```powershell
npm run deploy:aws
```

Opciones adicionales:

```powershell
powershell -ExecutionPolicy Bypass -File ./scripts/deploy-aws.ps1 -StackName "mi-stack" -ProjectName "mi-app" -Region "us-east-1"
```

## CI/CD con GitHub Actions

El workflow `.github/workflows/deploy-aws.yml` corre lint, verificacion de tipos y pruebas,
y luego despliega el frontend en cada push a `main`.

Debes crear el secreto:

- `AWS_ROLE_TO_ASSUME`: ARN del rol IAM con OIDC para GitHub Actions.

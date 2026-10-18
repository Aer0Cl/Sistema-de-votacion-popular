# Sistema de votacion popular

Aplicacion web para votaciones al estilo de los premios Oscar: algunas categorias se
deciden por mayoria simple y otras, como Mejor Pelicula, por ranking de preferencias
(segunda vuelta instantanea). Cada voto se asocia a un usuario y los resultados se
pueden calcular por grupo de usuarios.

El plan de desarrollo esta en [docs/plan-sistema-votacion.md](docs/plan-sistema-votacion.md).

## Stack

- Frontend: Vue 3 + TypeScript + Vite, Vue Router y Pinia
- Backend (en construccion): Node + TypeScript sobre AWS Lambda
- Pruebas con Vitest
- Infraestructura como codigo con CloudFormation (S3 + CloudFront)
- CI/CD con GitHub Actions
- ESLint + Prettier

## Estructura del proyecto (npm workspaces)

```text
.
|-- apps/
|   |-- web/              # frontend Vue (@votacion/web)
|   `-- api/              # backend serverless (@votacion/api)
|-- packages/
|   `-- voting-core/      # tipos de dominio y algoritmos de conteo (@votacion/voting-core)
|-- infra/
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
- AWS CLI v2 configurado (`aws configure`) para desplegar
- Permisos IAM para CloudFormation, S3 y CloudFront

## Comandos

Desde la raiz del repositorio:

```bash
npm install
npm run dev            # servidor de desarrollo del frontend
npm run lint
npm run check          # verificacion de tipos en todos los workspaces
npm test               # pruebas de todos los workspaces
npm run build
npm run format
npm run preview
```

Para correr un comando en un solo workspace: `npm run test -w @votacion/api`.

## Despliegue AWS (local)

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

# Template Base: Vue + TypeScript + AWS

Template inicial para crear una aplicacion web con Vue 3 y TypeScript,
preparada para desplegar en AWS como sitio estatico usando S3 + CloudFront.

## Stack

- Vue 3 + TypeScript + Vite
- Vue Router para navegacion
- Pinia para estado global
- Infraestructura como codigo con CloudFormation
- Script local de despliegue con AWS CLI
- Pipeline CI/CD con GitHub Actions
- ESLint + Prettier para calidad de codigo

## Requisitos

- Node.js 20+
- npm 10+
- AWS CLI v2 configurado (`aws configure`)
- Permisos IAM para:
  - CloudFormation
  - S3
  - CloudFront

## Comandos

```bash
npm install
npm run dev
npm run check
npm run build
npm run lint
npm run lint:fix
npm run format
npm run format:check
npm run preview
```

## Despliegue AWS (local)

```powershell
npm run deploy:aws
```

Opciones adicionales:

```powershell
powershell -ExecutionPolicy Bypass -File ./scripts/deploy-aws.ps1 -StackName "mi-stack" -ProjectName "mi-app" -Region "us-east-1"
```

## CI/CD con GitHub Actions

El workflow se encuentra en `.github/workflows/deploy-aws.yml` y despliega en cada push a `main`.

Debes crear el secreto:

- `AWS_ROLE_TO_ASSUME`: ARN del rol IAM con OIDC para GitHub Actions.

## Estructura del proyecto

```text
.
|-- .github/
|   `-- workflows/
|       `-- deploy-aws.yml
|-- infra/
|   `-- cloudformation/
|       `-- static-site.yaml
|-- scripts/
|   `-- deploy-aws.ps1
|-- src/
|-- package.json
`-- README.md
```

## Siguientes pasos sugeridos

1. Definir las features iniciales del MVP.
2. Agregar `vue-router` y manejo de estado (`pinia`) si aplica.
3. Crear capa de servicios para consumir APIs (REST/GraphQL).
4. Integrar observabilidad (CloudWatch RUM, logs y metricas).

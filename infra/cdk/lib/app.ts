import { Tags, Validations } from 'aws-cdk-lib'
import type { App, Environment } from 'aws-cdk-lib'
import { ManagedPolicy, PermissionsBoundary } from 'aws-cdk-lib/aws-iam'
import { AwsSolutionsChecks } from 'cdk-nag'
import { ApiStack } from './api-stack'
import { appPermissionsBoundaryName } from './config'
import type { Stage } from './config'
import { DataStack } from './data-stack'
import { WebStack } from './web-stack'

export interface VotingAppOptions {
  readonly stage: Stage
  readonly env?: Environment
  // Origenes extra habilitados por CORS (p. ej. http://localhost:5173); el del front en
  // CloudFront se agrega siempre
  readonly allowedOrigins: readonly string[]
}

// Stacks de CloudFormation por stage: Votacion-<stage>-{Data,Web,Api}
export function createVotingStacks(app: App, options: VotingAppOptions) {
  const { stage, env } = options
  if (stage === 'prod') {
    // La API usa X-User-Id como identidad hasta integrar Cognito: no es seguro fuera de dev
    throw new Error(
      'El stage prod requiere autenticacion con Cognito, que aun no esta integrada.',
    )
  }

  const data = new DataStack(app, `Votacion-${stage}-Data`, {
    stage,
    env,
    description: 'Tablas DynamoDB del sistema de votacion popular',
  })
  const web = new WebStack(app, `Votacion-${stage}-Web`, {
    stage,
    env,
    description:
      'Sitio estatico del front (S3 y CloudFront) del sistema de votacion popular',
  })
  const api = new ApiStack(app, `Votacion-${stage}-Api`, {
    stage,
    env,
    description: 'API HTTP, Lambdas y monitoreo del sistema de votacion popular',
    tables: data.tables,
    allowedOrigins: [...options.allowedOrigins, web.url],
  })

  // El rol de ejecucion de CloudFormation solo permite crear roles con este limite
  for (const stack of [data, web, api]) {
    PermissionsBoundary.of(stack).apply(
      ManagedPolicy.fromManagedPolicyName(
        stack,
        'AppPermissionsBoundary',
        appPermissionsBoundaryName(stage),
      ),
    )
  }

  Tags.of(app).add('project', 'votacion-popular')
  Tags.of(app).add('stage', stage)
  Validations.of(app).addPlugins(new AwsSolutionsChecks(app, { verbose: true }))
  return { data, web, api }
}

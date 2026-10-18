import { Tags, Validations } from 'aws-cdk-lib'
import type { App, Environment } from 'aws-cdk-lib'
import { ManagedPolicy, PermissionsBoundary } from 'aws-cdk-lib/aws-iam'
import { AwsSolutionsChecks } from 'cdk-nag'
import { ApiStack } from './api-stack'
import { appPermissionsBoundaryName } from './config'
import type { Stage } from './config'
import { DataStack } from './data-stack'

export interface VotingAppOptions {
  readonly stage: Stage
  readonly env?: Environment
  readonly allowedOrigins: readonly string[]
}

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
  const api = new ApiStack(app, `Votacion-${stage}-Api`, {
    stage,
    env,
    description: 'API HTTP, Lambdas y monitoreo del sistema de votacion popular',
    tables: data.tables,
    allowedOrigins: options.allowedOrigins,
  })

  // El rol de ejecucion de CloudFormation solo permite crear roles con este limite
  PermissionsBoundary.of(api).apply(
    ManagedPolicy.fromManagedPolicyName(
      api,
      'AppPermissionsBoundary',
      appPermissionsBoundaryName(stage),
    ),
  )

  Tags.of(app).add('project', 'votacion-popular')
  Tags.of(app).add('stage', stage)
  Validations.of(app).addPlugins(new AwsSolutionsChecks(app, { verbose: true }))
  return { data, api }
}

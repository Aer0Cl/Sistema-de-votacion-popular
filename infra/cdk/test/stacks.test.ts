import { App } from 'aws-cdk-lib'
import { Match, Template } from 'aws-cdk-lib/assertions'
import { describe, expect, it } from 'vitest'
import { createVotingStacks } from '../lib/app'
import { TABLE_SPECS } from '../lib/data-stack'

function synth() {
  // Sin empaquetar la Lambda: los tests solo revisan la plantilla
  const app = new App({ context: { 'aws:cdk:bundling-stacks': [] } })
  const { data, api } = createVotingStacks(app, {
    stage: 'dev',
    env: { account: '123456789012', region: 'us-east-1' },
    allowedOrigins: ['http://localhost:5173'],
  })
  return { data: Template.fromStack(data), api: Template.fromStack(api) }
}

const { data, api } = synth()

describe('DataStack', () => {
  it('crea una tabla por entidad, bajo demanda y con PITR', () => {
    data.resourceCountIs('AWS::DynamoDB::Table', Object.keys(TABLE_SPECS).length)
    data.allResourcesProperties('AWS::DynamoDB::Table', {
      BillingMode: 'PAY_PER_REQUEST',
      PointInTimeRecoverySpecification: { PointInTimeRecoveryEnabled: true },
    })
  })

  it('usa los nombres y claves que espera la Lambda', () => {
    data.hasResourceProperties('AWS::DynamoDB::Table', {
      TableName: 'votacion-dev-answerHistory',
      KeySchema: [
        { AttributeName: 'userCategory', KeyType: 'HASH' },
        { AttributeName: 'version', KeyType: 'RANGE' },
      ],
    })
    data.hasResourceProperties('AWS::DynamoDB::Table', {
      TableName: 'votacion-dev-memberships',
      GlobalSecondaryIndexes: [Match.objectLike({ IndexName: 'byUser' })],
    })
  })

  it('en dev las tablas se pueden destruir', () => {
    const tables = data.findResources('AWS::DynamoDB::Table')
    for (const table of Object.values(tables)) {
      expect(table.DeletionPolicy).toBe('Delete')
    }
  })
})

describe('ApiStack', () => {
  it('crea las Lambdas en Python 3.14 ARM con las tablas y el modo de autenticacion', () => {
    api.resourceCountIs('AWS::Lambda::Function', 2)
    api.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: 'votacion-dev-api',
      Runtime: 'python3.14',
      Architectures: ['arm64'],
      Handler: 'votacion_api.app.handler',
      Environment: {
        Variables: Match.objectLike({
          AUTH_MODE: 'dev-header',
          ANSWER_HISTORY_TABLE: Match.anyValue(),
          SNAPSHOTS_TABLE: Match.anyValue(),
        }),
      },
    })
  })

  it('envia los logs a grupos con retencion', () => {
    api.resourceCountIs('AWS::Logs::LogGroup', 3)
    api.allResourcesProperties('AWS::Logs::LogGroup', { RetentionInDays: 14 })
    api.hasResourceProperties('AWS::ApiGatewayV2::Stage', {
      StageName: '$default',
      AccessLogSettings: Match.objectLike({
        Format: Match.stringLikeRegexp('requestId'),
      }),
    })
  })

  it('expone la API bajo /api/v1 y programa la foto de cierre', () => {
    api.hasResourceProperties('AWS::ApiGatewayV2::Route', {
      RouteKey: Match.stringLikeRegexp('/api/v1/\\{proxy\\+\\}$'),
    })
    api.hasResourceProperties('AWS::Events::Rule', {
      ScheduleExpression: 'rate(5 minutes)',
    })
  })

  it('no usa comodines en los permisos de DynamoDB', () => {
    const policies = api.findResources('AWS::IAM::Policy')
    const statements = Object.values(policies).flatMap(
      (policy) =>
        policy.Properties.PolicyDocument.Statement as {
          Action: string[]
          Resource: unknown
        }[],
    )
    expect(statements.length).toBeGreaterThan(0)
    for (const statement of statements) {
      expect(statement.Action.every((action) => !action.includes('*'))).toBe(true)
      expect(JSON.stringify(statement.Resource)).not.toContain('*')
    }
  })

  it('todos los roles llevan el limite de permisos y nombres que acepta la politica de ejecucion', () => {
    const roles = api.findResources('AWS::IAM::Role')
    expect(Object.keys(roles).length).toBeGreaterThan(0)
    for (const role of Object.values(roles)) {
      expect(JSON.stringify(role.Properties.PermissionsBoundary)).toContain(
        'policy/votacion-dev-app-boundary',
      )
      // CloudFormation nombra los roles <stack>-<id>-<sufijo>; dev-access.yaml permite role/Votacion-dev-*
      expect(role.Properties.RoleName).toBeUndefined()
    }
  })

  it('crea alarmas y un panel de monitoreo', () => {
    api.resourceCountIs('AWS::CloudWatch::Alarm', 3)
    api.resourceCountIs('AWS::CloudWatch::Dashboard', 1)
  })
})

describe('stages', () => {
  it('no permite prod hasta integrar Cognito', () => {
    expect(() =>
      createVotingStacks(new App(), { stage: 'prod', allowedOrigins: [] }),
    ).toThrow(/Cognito/)
  })
})

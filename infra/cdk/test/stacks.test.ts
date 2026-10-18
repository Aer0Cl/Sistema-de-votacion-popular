import { App } from 'aws-cdk-lib'
import { Match, Template } from 'aws-cdk-lib/assertions'
import { describe, expect, it } from 'vitest'
import { createVotingStacks } from '../lib/app'
import { TABLE_SPECS } from '../lib/data-stack'

function synth() {
  // Sin empaquetar la Lambda: los tests solo revisan la plantilla
  const app = new App({ context: { 'aws:cdk:bundling-stacks': [] } })
  const { data, web, api } = createVotingStacks(app, {
    stage: 'dev',
    env: { account: '123456789012', region: 'us-east-1' },
    allowedOrigins: ['http://localhost:5173'],
  })
  return {
    data: Template.fromStack(data),
    web: Template.fromStack(web),
    api: Template.fromStack(api),
  }
}

const { data, web, api } = synth()

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

describe('WebStack', () => {
  it('guarda el front en un bucket privado con nombre que acepta dev-access.yaml', () => {
    web.hasResourceProperties('AWS::S3::Bucket', {
      BucketName: 'votacion-dev-web-123456789012',
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    })
  })

  it('sirve el bucket solo por CloudFront con OAC y HTTPS', () => {
    web.resourceCountIs('AWS::CloudFront::OriginAccessControl', 1)
    web.hasResourceProperties('AWS::S3::BucketPolicy', {
      PolicyDocument: {
        // arrayWith respeta el orden: enforceSSL agrega el Deny antes que el permiso de OAC
        Statement: Match.arrayWith([
          Match.objectLike({
            Effect: 'Deny',
            Condition: { Bool: { 'aws:SecureTransport': 'false' } },
          }),
          Match.objectLike({
            Effect: 'Allow',
            Principal: { Service: 'cloudfront.amazonaws.com' },
            Action: 's3:GetObject',
          }),
        ]),
      },
    })
    web.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({
        DefaultRootObject: 'index.html',
        DefaultCacheBehavior: Match.objectLike({
          ViewerProtocolPolicy: 'redirect-to-https',
        }),
      }),
    })
  })

  it('resuelve las rutas del router con index.html', () => {
    web.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({
        CustomErrorResponses: [403, 404].map((ErrorCode) => ({
          ErrorCode,
          ResponseCode: 200,
          ResponsePagePath: '/index.html',
          ErrorCachingMinTTL: 0,
        })),
      }),
    })
  })

  it('no crea roles ni Lambdas (el front lo sube el workflow con aws s3 sync)', () => {
    web.resourceCountIs('AWS::IAM::Role', 0)
    web.resourceCountIs('AWS::Lambda::Function', 0)
  })

  it('publica las salidas que lee el workflow', () => {
    for (const output of ['WebBucketName', 'DistributionId', 'WebUrl']) {
      web.hasOutput(output, {})
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

  it('habilita por CORS el front de CloudFront ademas de los origenes extra', () => {
    const [httpApi] = Object.values(api.findResources('AWS::ApiGatewayV2::Api'))
    const origins = httpApi.Properties.CorsConfiguration.AllowOrigins as unknown[]
    expect(origins[0]).toBe('http://localhost:5173')
    expect(JSON.stringify(origins[1])).toContain('Votacion-dev-Web')
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

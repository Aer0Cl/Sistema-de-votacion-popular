import { fileURLToPath } from 'node:url'
import { CfnOutput, Duration, RemovalPolicy, Stack, Validations } from 'aws-cdk-lib'
import type { StackProps } from 'aws-cdk-lib'
import { AccessLogFormat } from 'aws-cdk-lib/aws-apigateway'
import {
  CorsHttpMethod,
  HttpApi,
  HttpMethod,
  HttpStage,
  LogGroupLogDestination,
} from 'aws-cdk-lib/aws-apigatewayv2'
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations'
import {
  Alarm,
  ComparisonOperator,
  Dashboard,
  GraphWidget,
  TreatMissingData,
} from 'aws-cdk-lib/aws-cloudwatch'
import type { IMetric } from 'aws-cdk-lib/aws-cloudwatch'
import { Rule, Schedule } from 'aws-cdk-lib/aws-events'
import { LambdaFunction } from 'aws-cdk-lib/aws-events-targets'
import { Architecture, Function, Runtime } from 'aws-cdk-lib/aws-lambda'
import type { FunctionProps } from 'aws-cdk-lib/aws-lambda'
import { PolicyStatement } from 'aws-cdk-lib/aws-iam'
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs'

import type { Construct } from 'constructs'
import { resourceName } from './config'
import type { Stage } from './config'
import { TABLE_SPECS } from './data-stack'
import type { TableKind, TableSpec, VotingTables } from './data-stack'
import { pythonLambdaCode } from './python-bundling'

const API_PROJECT_DIR = fileURLToPath(new URL('../../../apps/api', import.meta.url))

// Acciones que usa apps/api/src/votacion_api/repository/dynamo.py (TransactWriteItems y
// BatchWriteItem se autorizan con PutItem/DeleteItem sobre cada tabla)
const DYNAMO_READ = ['dynamodb:GetItem', 'dynamodb:Query', 'dynamodb:Scan']
const DYNAMO_WRITE = [
  'dynamodb:PutItem',
  'dynamodb:UpdateItem',
  'dynamodb:DeleteItem',
  'dynamodb:BatchWriteItem',
]

export interface ApiStackProps extends StackProps {
  readonly stage: Stage
  readonly tables: VotingTables
  // origenes del front habilitados por CORS
  readonly allowedOrigins: readonly string[]
}

export class ApiStack extends Stack {
  readonly apiUrl: string

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props)
    const { stage, tables } = props
    const isProd = stage === 'prod'
    const name = (resource: string) => resourceName(stage, resource)
    const logRetention = isProd ? RetentionDays.THREE_MONTHS : RetentionDays.TWO_WEEKS
    const logRemoval = isProd ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY

    const code = pythonLambdaCode(API_PROJECT_DIR)
    const tableEnv = Object.fromEntries(
      (Object.keys(TABLE_SPECS) as TableKind[]).map((kind) => [
        TABLE_SPECS[kind].envVar,
        tables[kind].tableName,
      ]),
    )

    const logGroup = (id: string, logGroupName: string) =>
      new LogGroup(this, id, {
        logGroupName,
        retention: logRetention,
        removalPolicy: logRemoval,
      })

    const pythonFunction = (
      id: string,
      resource: string,
      props: Partial<FunctionProps>,
    ) =>
      new Function(this, id, {
        functionName: name(resource),
        runtime: Runtime.PYTHON_3_14,
        architecture: Architecture.ARM_64,
        code,
        handler: 'votacion_api.app.handler',
        memorySize: 512,
        timeout: Duration.seconds(15),
        logGroup: logGroup(`${id}Logs`, `/aws/lambda/${name(resource)}`),
        environment: {
          ...tableEnv,
          STAGE: stage,
          // Hasta integrar Cognito el usuario llega en X-User-Id (solo en dev, ver bin/app.ts)
          AUTH_MODE: 'dev-header',
          POWERTOOLS_SERVICE_NAME: 'votacion-api',
          POWERTOOLS_LOG_LEVEL: isProd ? 'INFO' : 'DEBUG',
        },
        ...props,
      })

    // --- Lambdas -------------------------------------------------------------------

    // Permisos explicitos por tabla e indice (sin comodines), en lugar de grant*()
    const grantTables = (
      fn: Function,
      access: Partial<Record<TableKind, 'read' | 'write'>>,
    ) => {
      for (const [kind, level] of Object.entries(access) as [
        TableKind,
        'read' | 'write',
      ][]) {
        const table = tables[kind]
        const indexes = Object.keys((TABLE_SPECS[kind] as TableSpec).indexes ?? {})
        fn.addToRolePolicy(
          new PolicyStatement({
            actions: level === 'read' ? DYNAMO_READ : [...DYNAMO_READ, ...DYNAMO_WRITE],
            resources: [
              table.tableArn,
              ...indexes.map((index) => `${table.tableArn}/index/${index}`),
            ],
          }),
        )
      }
    }

    const apiFunction = pythonFunction('ApiFunction', 'api', {
      description: 'API HTTP del sistema de votacion popular',
    })
    grantTables(apiFunction, {
      // alta de usuarios por los administradores (POST /admin/users)
      users: 'write',
      categories: 'write',
      nominees: 'write',
      elections: 'write',
      memberships: 'write',
      answers: 'write',
      answerHistory: 'write',
      // la API toma la foto si una votacion cerrada aun no la tiene
      snapshots: 'write',
    })

    const snapshotFunction = pythonFunction('SnapshotFunction', 'snapshots', {
      description: 'Toma la foto de las respuestas de las votaciones cerradas',
      handler: 'votacion_api.app.snapshot_handler',
      timeout: Duration.minutes(5),
    })
    grantTables(snapshotFunction, {
      elections: 'write',
      memberships: 'read',
      answerHistory: 'read',
      snapshots: 'write',
    })

    // La foto solo usa respuestas anteriores al cierre, asi que unos minutos de retraso no
    // cambian el resultado; ademas la API la toma al primer acceso si falta.
    new Rule(this, 'SnapshotSchedule', {
      ruleName: name('snapshots'),
      description: 'Revisa cada 5 minutos si hay votaciones cerradas sin foto',
      schedule: Schedule.rate(Duration.minutes(5)),
      targets: [new LambdaFunction(snapshotFunction, { retryAttempts: 2 })],
    })

    // --- HTTP API ------------------------------------------------------------------

    const httpApi = new HttpApi(this, 'HttpApi', {
      apiName: name('api'),
      description: 'API del sistema de votacion popular',
      createDefaultStage: false,
      corsPreflight: {
        allowOrigins: [...props.allowedOrigins],
        allowMethods: [
          CorsHttpMethod.GET,
          CorsHttpMethod.POST,
          CorsHttpMethod.PUT,
          CorsHttpMethod.PATCH,
          CorsHttpMethod.DELETE,
        ],
        allowHeaders: ['content-type', 'authorization', 'x-user-id'],
        maxAge: Duration.hours(1),
      },
    })
    httpApi.addRoutes({
      path: '/api/v1/{proxy+}',
      methods: [
        HttpMethod.GET,
        HttpMethod.POST,
        HttpMethod.PUT,
        HttpMethod.PATCH,
        HttpMethod.DELETE,
      ],
      integration: new HttpLambdaIntegration('ApiIntegration', apiFunction),
    })

    const accessLogs = logGroup('ApiAccessLogs', `/aws/apigateway/${name('api')}`)
    new HttpStage(this, 'DefaultStage', {
      httpApi,
      stageName: '$default',
      autoDeploy: true,
      throttle: { rateLimit: 50, burstLimit: 100 },
      accessLogSettings: {
        destination: new LogGroupLogDestination(accessLogs),
        format: AccessLogFormat.custom(
          JSON.stringify({
            requestId: '$context.requestId',
            ip: '$context.identity.sourceIp',
            requestTime: '$context.requestTime',
            method: '$context.httpMethod',
            path: '$context.path',
            routeKey: '$context.routeKey',
            status: '$context.status',
            latencyMs: '$context.responseLatency',
            integrationLatencyMs: '$context.integrationLatency',
            integrationError: '$context.integrationErrorMessage',
          }),
        ),
      },
    })

    // --- Monitoreo -----------------------------------------------------------------

    // Sin destino de notificacion todavia: se ven en la consola de CloudWatch
    const alarm = (id: string, description: string, metric: IMetric) =>
      new Alarm(this, id, {
        alarmName: name(id),
        alarmDescription: description,
        metric,
        threshold: 1,
        evaluationPeriods: 1,
        comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: TreatMissingData.NOT_BREACHING,
      })

    const period = Duration.minutes(5)
    alarm(
      'api-errors',
      'Errores no controlados en la Lambda de la API',
      apiFunction.metricErrors({ period }),
    )
    alarm(
      'snapshot-errors',
      'Fallas al tomar las fotos de cierre',
      snapshotFunction.metricErrors({ period }),
    )
    alarm('api-5xx', 'Respuestas 5xx de la API', httpApi.metricServerError({ period }))

    new Dashboard(this, 'Dashboard', {
      dashboardName: name('backend'),
      widgets: [
        [
          new GraphWidget({
            title: 'API: solicitudes y errores',
            left: [
              httpApi.metricCount({ period }),
              httpApi.metricClientError({ period }),
            ],
            right: [httpApi.metricServerError({ period })],
          }),
          new GraphWidget({
            title: 'API: latencia',
            left: [httpApi.metricLatency({ period, statistic: 'p90' })],
          }),
        ],
        [
          new GraphWidget({
            title: 'Lambda API',
            left: [
              apiFunction.metricInvocations({ period }),
              apiFunction.metricErrors({ period }),
            ],
            right: [apiFunction.metricDuration({ period, statistic: 'p90' })],
          }),
          new GraphWidget({
            title: 'Fotos de cierre',
            left: [
              snapshotFunction.metricInvocations({ period }),
              snapshotFunction.metricErrors({ period }),
            ],
          }),
        ],
      ],
    })

    this.apiUrl = httpApi.apiEndpoint
    new CfnOutput(this, 'ApiUrl', {
      value: `${httpApi.apiEndpoint}/api/v1`,
      description: 'URL base de la API para VITE_API_URL',
    })

    this.suppressFindings(stage, [apiFunction, snapshotFunction])
  }

  // Hallazgos de cdk-nag aceptados, cada uno con su justificacion
  private suppressFindings(stage: Stage, functions: Function[]) {
    for (const fn of functions) {
      Validations.of(fn).acknowledge({
        id: 'AwsSolutions-IAM4[Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole]',
        reason:
          'AWSLambdaBasicExecutionRole solo permite escribir en CloudWatch Logs; es la politica estandar de Lambda.',
      })
    }

    if (stage === 'dev') {
      Validations.of(this).acknowledge({
        id: 'AwsSolutions-APIG4',
        reason:
          'Stage dev sin autorizador: la autenticacion con Cognito se integrara mas adelante. bin/app.ts impide desplegar prod asi.',
      })
    }
  }
}

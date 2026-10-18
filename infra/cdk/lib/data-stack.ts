import { RemovalPolicy, Stack } from 'aws-cdk-lib'
import type { StackProps } from 'aws-cdk-lib'
import {
  AttributeType,
  BillingMode,
  Table,
  TableEncryption,
} from 'aws-cdk-lib/aws-dynamodb'
import type { Construct } from 'constructs'
import { resourceName } from './config'
import type { Stage } from './config'

type KeySpec = { readonly partition: string; readonly sort?: string }

export type TableSpec = KeySpec & {
  readonly indexes?: Readonly<Record<string, KeySpec>>
  // nombre de la variable de entorno con que la Lambda recibe el nombre de la tabla
  readonly envVar: string
}

/**
 * Esquema de las tablas. Debe coincidir con apps/api/src/votacion_api/repository/dynamo.py
 * y con el esquema de tests en apps/api/tests/conftest.py.
 */
export const TABLE_SPECS = {
  // DynamoDB solo declara la clave; cada usuario guarda ademas displayName (nombre) y role
  // (voter | admin), que exige apps/api/src/votacion_api/repository/__init__.py (user_item)
  users: { partition: 'id', envVar: 'USERS_TABLE' },
  categories: { partition: 'id', envVar: 'CATEGORIES_TABLE' },
  nominees: {
    partition: 'id',
    indexes: { byCategory: { partition: 'categoryId', sort: 'createdAt' } },
    envVar: 'NOMINEES_TABLE',
  },
  elections: { partition: 'code', envVar: 'ELECTIONS_TABLE' },
  memberships: {
    partition: 'electionCode',
    sort: 'userId',
    indexes: { byUser: { partition: 'userId', sort: 'electionCode' } },
    envVar: 'MEMBERSHIPS_TABLE',
  },
  // respuesta actual de cada usuario por categoria
  answers: { partition: 'userId', sort: 'categoryId', envVar: 'ANSWERS_TABLE' },
  // registro de votos: cada guardado es una version nueva, nunca se sobrescribe
  answerHistory: {
    partition: 'userCategory',
    sort: 'version',
    envVar: 'ANSWER_HISTORY_TABLE',
  },
  // foto de las respuestas de cada votacion al cierre
  snapshots: {
    partition: 'electionCode',
    sort: 'userCategory',
    envVar: 'SNAPSHOTS_TABLE',
  },
} as const satisfies Record<string, TableSpec>

export type TableKind = keyof typeof TABLE_SPECS

export type VotingTables = Readonly<Record<TableKind, Table>>

export interface DataStackProps extends StackProps {
  readonly stage: Stage
}

// Recursos con estado en su propio stack, con proteccion contra borrado en prod
export class DataStack extends Stack {
  readonly tables: VotingTables

  constructor(scope: Construct, id: string, props: DataStackProps) {
    super(scope, id, props)
    const isProd = props.stage === 'prod'

    const entries = (Object.keys(TABLE_SPECS) as TableKind[]).map((kind) => {
      const spec: TableSpec = TABLE_SPECS[kind]
      const table = new Table(this, `${kind}Table`, {
        tableName: resourceName(props.stage, kind),
        partitionKey: { name: spec.partition, type: AttributeType.STRING },
        sortKey: spec.sort ? { name: spec.sort, type: AttributeType.STRING } : undefined,
        billingMode: BillingMode.PAY_PER_REQUEST,
        encryption: TableEncryption.AWS_MANAGED,
        pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
        deletionProtection: isProd,
        removalPolicy: isProd ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
      })
      for (const [indexName, index] of Object.entries(spec.indexes ?? {})) {
        table.addGlobalSecondaryIndex({
          indexName,
          partitionKey: { name: index.partition, type: AttributeType.STRING },
          sortKey: index.sort
            ? { name: index.sort, type: AttributeType.STRING }
            : undefined,
        })
      }
      return [kind, table] as const
    })

    this.tables = Object.fromEntries(entries) as VotingTables
  }
}

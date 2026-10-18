import { App } from 'aws-cdk-lib'
import { createVotingStacks } from '../lib/app'
import { STAGES, isStage } from '../lib/config'

const app = new App()

// npx cdk deploy --all -c stage=dev
const stage: unknown = app.node.tryGetContext('stage') ?? 'dev'
if (!isStage(stage)) {
  throw new Error(`Stage invalido "${String(stage)}". Usa uno de: ${STAGES.join(', ')}.`)
}

createVotingStacks(app, {
  stage,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? 'us-east-1',
  },
  // -c allowedOrigins='["https://midominio.com"]' para agregar el dominio del front
  allowedOrigins: app.node.tryGetContext('allowedOrigins') ?? ['http://localhost:5173'],
})

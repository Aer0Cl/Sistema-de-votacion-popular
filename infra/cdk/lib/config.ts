export type Stage = 'dev' | 'prod'

export const STAGES: readonly Stage[] = ['dev', 'prod']

export function isStage(value: unknown): value is Stage {
  return typeof value === 'string' && (STAGES as readonly string[]).includes(value)
}

// Prefijo comun de los nombres de recursos: votacion-<stage>-<recurso>
export function resourceName(stage: Stage, name: string): string {
  return `votacion-${stage}-${name}`
}

// Limite de permisos de todos los roles de CDK; lo crea infra/cloudformation/dev-access.yaml
export function appPermissionsBoundaryName(stage: Stage): string {
  return resourceName(stage, 'app-boundary')
}

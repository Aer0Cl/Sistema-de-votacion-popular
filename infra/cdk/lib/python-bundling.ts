import { execFileSync } from 'node:child_process'
import { cpSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DockerImage } from 'aws-cdk-lib'
import type { BundlingOptions, ILocalBundling } from 'aws-cdk-lib'
import { Code } from 'aws-cdk-lib/aws-lambda'

export const PYTHON_VERSION = '3.14'

// Archivos del proyecto Python que no forman parte del paquete ni del hash del asset
const EXCLUDE = [
  '.venv',
  'tests',
  '**/__pycache__',
  '.pytest_cache',
  '.ruff_cache',
  'node_modules',
]

/**
 * Empaqueta la Lambda con uv, sin Docker: instala las dependencias bloqueadas en uv.lock
 * para Linux ARM64 y agrega el paquete votacion_api.
 */
class UvLocalBundling implements ILocalBundling {
  private readonly projectDir: string

  constructor(projectDir: string) {
    this.projectDir = projectDir
  }

  tryBundle(outputDir: string): boolean {
    try {
      execFileSync('uv', ['--version'], { stdio: 'ignore' })
    } catch {
      return false // sin uv se usa la imagen de Docker
    }

    const workDir = mkdtempSync(join(tmpdir(), 'votacion-bundle-'))
    try {
      const requirements = join(workDir, 'requirements.txt')
      const run = (args: string[]) =>
        execFileSync('uv', args, {
          cwd: this.projectDir,
          stdio: ['ignore', 'ignore', 'inherit'],
        })

      run([
        'export',
        '--frozen',
        '--no-dev',
        '--no-hashes',
        '--no-emit-project',
        '-o',
        requirements,
      ])
      run([
        'pip',
        'install',
        '--requirements',
        requirements,
        '--target',
        outputDir,
        '--python-platform',
        'aarch64-manylinux2014',
        '--python-version',
        PYTHON_VERSION,
        '--only-binary',
        ':all:',
      ])
      cpSync(
        join(this.projectDir, 'src', 'votacion_api'),
        join(outputDir, 'votacion_api'),
        {
          recursive: true,
          filter: (source) => !source.includes('__pycache__'),
        },
      )
      return true
    } finally {
      rmSync(workDir, { recursive: true, force: true })
    }
  }
}

export function pythonLambdaCode(projectDir: string): Code {
  const bundling: BundlingOptions = {
    local: new UvLocalBundling(projectDir),
    // Alternativa con Docker (por ejemplo en CI sin uv)
    image: DockerImage.fromRegistry(`public.ecr.aws/sam/build-python${PYTHON_VERSION}`),
    command: [
      'bash',
      '-c',
      'pip install uv && uv export --frozen --no-dev --no-hashes --no-emit-project -o /tmp/req.txt' +
        ' && pip install -r /tmp/req.txt -t /asset-output && cp -r src/votacion_api /asset-output/',
    ],
  }
  return Code.fromAsset(projectDir, { exclude: EXCLUDE, bundling })
}

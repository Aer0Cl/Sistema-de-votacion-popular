/// <reference types="vite/client" />

interface ImportMetaEnv {
  // URL base del backend, terminada en /api/v1 (salida ApiUrl del stack de CDK)
  readonly VITE_API_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

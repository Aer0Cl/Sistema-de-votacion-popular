#!/usr/bin/env bash
set -euo pipefail

echo "Verificando disponibilidad de AWS CLI..."
if ! command -v aws >/dev/null 2>&1; then
  echo "aws CLI no encontrado en PATH. Asegúrate de instalar awscli o añadir ~/.local/bin al PATH." >&2
  exit 2
fi

echo "Ejecutando: aws sts get-caller-identity"
if aws sts get-caller-identity --output json; then
  echo "Verificación completada correctamente. Credenciales válidas o session disponible."
  exit 0
else
  echo "No se pudieron obtener las credenciales o no tienen permisos para sts:get-caller-identity." >&2
  echo "Si usas Codespaces, verifica que hayas configurado Secrets/Variables o ejecutado 'aws configure' dentro del Codespace." >&2
  exit 3
fi

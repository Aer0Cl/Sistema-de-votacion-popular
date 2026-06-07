# Credenciales AWS en GitHub Codespaces

Este documento explica formas seguras y prácticas de manejar credenciales de AWS al trabajar desde Codespaces.

**Resumen rápido**
- Recomendado: usar *Codespaces secrets* (repositorio/organización). Se inyectan como variables de entorno.
- Alternativa: ejecutar `aws configure` dentro del codespace (interactivo) para crear `~/.aws/credentials`.
- Mejor práctica: no guardar claves en el repositorio; usar roles temporales (OIDC) o secrets con privilegios mínimos.

**1) Añadir Secrets para Codespaces (recomendado)**

1. En GitHub abra su repositorio -> `Settings` -> `Secrets and variables` -> `Codespaces`.
2. Haga clic en `New repository secret` y añada las variables necesarias, por ejemplo:
   - `AWS_ACCESS_KEY_ID`
   - `AWS_SECRET_ACCESS_KEY`
   - `AWS_SESSION_TOKEN` (si usa sesiones temporales)
   - `AWS_REGION`

Nota: también puede crear *organization secrets* si varios repositorios comparten las mismas credenciales de uso seguro.

Cómo se usan en Codespaces:
- Al iniciar un Codespace, GitHub inyecta esos secrets como variables de entorno en el entorno del contenedor. No hace falta añadirlos manualmente al `devcontainer.json`.

Ejemplo: dentro del Codespace, verificar la identidad con:

```bash
aws sts get-caller-identity
```

Si la respuesta contiene un ARN válido, las credenciales están disponibles y funcionando.

**2) Usar `aws configure` dentro del Codespace (opción local)**

Si prefieres configurar el archivo `~/.aws/credentials` manualmente dentro del Codespace:

```bash
aws configure
# Ingresa AWS Access Key ID, Secret Access Key, region y formato
```

Esto crea `~/.aws/credentials` y `~/.aws/config` en el Codespace actual. Recuerda que estos archivos no se comparten ni persisten fuera del Codespace a menos que los subas voluntariamente (no recomendable).

**3) Usar variables de entorno manualmente**

También puedes exportar variables en la sesión actual (temporal):

```bash
export AWS_ACCESS_KEY_ID="..."
export AWS_SECRET_ACCESS_KEY="..."
export AWS_REGION="us-east-1"
aws sts get-caller-identity
```

No pongas valores en archivos del repositorio.

**4) Uso avanzado — OIDC / Roles temporales (recomendado para producción)**

Para evitar claves de larga duración, usa el flujo OIDC desde GitHub Actions o configurar roles con federación para otorgar acceso temporal. En Codespaces esto requiere configurar roles y, típicamente, una integración adicional (por ejemplo, un pequeño script que obtiene credenciales temporales desde un proveedor de identidad). Investigar: *GitHub Actions OIDC to AWS* y *IAM Roles for GitHub Actions*.

**5) Buenas prácticas**
- Limita los permisos de la clave a los mínimos necesarios (principio de menor privilegio).
- Prefiere credenciales temporales en vez de claves permanentes.
- Nunca commits de claves o `~/.aws/` en el repo.
- Usa repository/org secrets o pre-provisión segura (OIDC) cuando sea posible.

**6) Ejemplo práctico — integración con `devcontainer`**

Si añadiste secrets en el repositorio, no necesitas cambios especiales en `devcontainer.json`. Los secrets serán variables de entorno disponibles al iniciar el Codespace.

Para comprobar dentro del Codespace:

```bash
echo "$AWS_ACCESS_KEY_ID" >/dev/null && aws sts get-caller-identity
```

Si prefieres mapear variables al arranque, `postCreateCommand` puede usar valores ya inyectados por GitHub:

```json
"postCreateCommand": "aws sts get-caller-identity || true"
```

pero evita poner valores sensibles explícitamente en `devcontainer.json`.

---

Si quieres, puedo añadir un ejemplo paso-a-paso con capturas o un pequeño script para validar y refrescar credenciales dentro del Codespace. ¿Lo agrego al documento?

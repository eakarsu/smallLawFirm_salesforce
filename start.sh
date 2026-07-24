#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "$0")" && pwd)"
source_dir="${RUNTIME_PROJECT_SOURCE:-$project_dir}"
initial_node_env="${NODE_ENV:-}"
if [[ "$initial_node_env" != "test" && -f "$project_dir/.env" ]]; then set -a; source "$project_dir/.env"; set +a; fi

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${NEXTAUTH_SECRET:?NEXTAUTH_SECRET is required}"
if (( ${#NEXTAUTH_SECRET} < 32 )); then echo "NEXTAUTH_SECRET must contain at least 32 characters" >&2; exit 1; fi
if [[ "$NEXTAUTH_SECRET" =~ ^(your-secret|change-me|dev-secret|replace-with) ]]; then echo "NEXTAUTH_SECRET must not be a placeholder" >&2; exit 1; fi
if [[ ! "$DATABASE_URL" =~ ^postgres(ql)?:// ]]; then echo "DATABASE_URL must be a PostgreSQL URL" >&2; exit 1; fi
if [[ ! -d "$source_dir/node_modules" ]]; then echo "Dependencies are missing; run npm ci during deployment" >&2; exit 1; fi
if [[ ! -f "$source_dir/.next/BUILD_ID" ]]; then echo "Production build is missing; run npm run build during deployment" >&2; exit 1; fi

: "${BACKEND_PORT:?BACKEND_PORT is required; choose an unused port explicitly}"
: "${FRONTEND_PORT:?FRONTEND_PORT is required; choose an unused port explicitly}"
if [[ "$BACKEND_PORT" == "$FRONTEND_PORT" ]]; then echo "BACKEND_PORT and FRONTEND_PORT must be distinct" >&2; exit 1; fi
for app_port in "$BACKEND_PORT" "$FRONTEND_PORT"; do
  if [[ ! "$app_port" =~ ^[0-9]+$ ]] || (( app_port < 1 || app_port > 65535 )); then echo "Runtime port is invalid" >&2; exit 1; fi
  if command -v lsof >/dev/null 2>&1 && lsof -nP -iTCP:"$app_port" -sTCP:LISTEN >/dev/null 2>&1; then echo "Port $app_port is already occupied; refusing to terminate another process" >&2; exit 1; fi
done

cd "$source_dir"
export NODE_ENV=production
npm start -- --hostname "${APP_HOST:-127.0.0.1}" --port "$FRONTEND_PORT" & app_pid=$!
node scripts/api-proxy.mjs & proxy_pid=$!
cleanup() {
  kill -TERM "${app_pid:-}" "${proxy_pid:-}" 2>/dev/null || :
  wait "${app_pid:-}" "${proxy_pid:-}" 2>/dev/null || :
}
trap cleanup EXIT INT TERM
while kill -0 "$app_pid" 2>/dev/null && kill -0 "$proxy_pid" 2>/dev/null; do sleep 1; done
exit 1

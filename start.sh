#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "$0")" && pwd)"
source_dir="${RUNTIME_PROJECT_SOURCE:-$project_dir}"

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${NEXTAUTH_SECRET:?NEXTAUTH_SECRET is required}"
if (( ${#NEXTAUTH_SECRET} < 32 )); then echo "NEXTAUTH_SECRET must contain at least 32 characters" >&2; exit 1; fi
if [[ "$NEXTAUTH_SECRET" =~ ^(your-secret|change-me|dev-secret|replace-with) ]]; then echo "NEXTAUTH_SECRET must not be a placeholder" >&2; exit 1; fi
if [[ ! "$DATABASE_URL" =~ ^postgres(ql)?:// ]]; then echo "DATABASE_URL must be a PostgreSQL URL" >&2; exit 1; fi
if [[ ! -d "$source_dir/node_modules" ]]; then echo "Dependencies are missing; run npm ci during deployment" >&2; exit 1; fi
if [[ ! -f "$source_dir/.next/BUILD_ID" ]]; then echo "Production build is missing; run npm run build during deployment" >&2; exit 1; fi

: "${PORT:?PORT is required; choose an unused port explicitly}"
app_port="$PORT"
if [[ ! "$app_port" =~ ^[0-9]+$ ]] || (( app_port < 1 || app_port > 65535 )); then echo "PORT is invalid" >&2; exit 1; fi
if command -v lsof >/dev/null 2>&1 && lsof -nP -iTCP:"$app_port" -sTCP:LISTEN >/dev/null 2>&1; then echo "Port $app_port is already occupied; refusing to terminate another process" >&2; exit 1; fi

cd "$source_dir"
export NODE_ENV=production
exec npm start -- --hostname "${APP_HOST:-127.0.0.1}" --port "$app_port"

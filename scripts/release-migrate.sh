#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
if [[ ! "$DATABASE_URL" =~ ^postgres(ql)?:// ]]; then echo "DATABASE_URL must be a PostgreSQL URL" >&2; exit 1; fi
npx prisma migrate deploy

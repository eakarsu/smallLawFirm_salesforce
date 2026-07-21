#!/usr/bin/env sh
set -eu

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${NEXTAUTH_SECRET:?NEXTAUTH_SECRET is required}"
if [ "${#NEXTAUTH_SECRET}" -lt 32 ]; then echo "NEXTAUTH_SECRET must contain at least 32 characters" >&2; exit 1; fi
case "$NEXTAUTH_SECRET" in your-secret*|change-me*|dev-secret*|replace-with*) echo "NEXTAUTH_SECRET must not be a placeholder" >&2; exit 1;; esac

# Schema migrations are an explicit release step. Runtime startup never migrates,
# seeds, installs, builds, kills processes, or continues after failed validation.
exec "$@"

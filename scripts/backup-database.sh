#!/usr/bin/env bash
set -euo pipefail
umask 077

: "${DATABASE_URL:?DATABASE_URL is required}"
backup_database_url="${BACKUP_DATABASE_URL:-$DATABASE_URL}"
if (( $# != 1 )); then echo "Usage: $0 ABSOLUTE_BACKUP_DIRECTORY" >&2; exit 2; fi
backup_dir="$1"
if [[ "$backup_dir" != /* || "$backup_dir" == "/" ]]; then echo "Backup directory must be an explicit absolute path other than /" >&2; exit 2; fi
mkdir -p -- "$backup_dir"
backup_dir="$(cd "$backup_dir" && pwd -P)"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
final_path="$backup_dir/getfirmflow-$stamp-$$.dump"
temporary_path="$final_path.partial"
trap 'rm -f -- "$temporary_path"' EXIT

pg_dump --dbname "$backup_database_url" --format=custom --no-owner --no-privileges --file "$temporary_path"
pg_restore --list "$temporary_path" >/dev/null
mv -- "$temporary_path" "$final_path"
(
  cd "$backup_dir"
  shasum -a 256 "$(basename "$final_path")" > "$(basename "$final_path").sha256"
)
trap - EXIT
printf '%s\n' "$final_path"

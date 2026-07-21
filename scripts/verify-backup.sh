#!/usr/bin/env bash
set -euo pipefail

if (( $# != 1 )); then echo "Usage: $0 BACKUP_FILE" >&2; exit 2; fi
backup_path="$1"
if [[ ! -f "$backup_path" || ! -f "$backup_path.sha256" ]]; then echo "Backup and checksum files are required" >&2; exit 2; fi
backup_dir="$(cd "$(dirname "$backup_path")" && pwd -P)"
backup_name="$(basename "$backup_path")"
(
  cd "$backup_dir"
  shasum -a 256 -c "$backup_name.sha256"
)
pg_restore --list "$backup_path" >/dev/null
printf 'Verified PostgreSQL custom backup: %s\n' "$backup_path"

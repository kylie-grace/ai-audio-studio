#!/usr/bin/env sh

set -eu

if [ -z "${POSTGRES_DSN:-}" ]; then
  echo "POSTGRES_DSN is required" >&2
  exit 1
fi

MIGRATIONS_DIR="${MIGRATIONS_DIR:-/migrations}"

psql "${POSTGRES_DSN}" -v ON_ERROR_STOP=1 <<'SQL'
CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
SQL

for file in "${MIGRATIONS_DIR}"/*.sql; do
  [ -e "${file}" ] || continue
  version="$(basename "${file}" .sql)"
  applied="$(psql "${POSTGRES_DSN}" -At -c "SELECT 1 FROM schema_migrations WHERE version='${version}' LIMIT 1")"
  if [ "${applied}" = "1" ]; then
    echo "Skipping ${version}; already applied"
    continue
  fi
  echo "Applying ${version}"
  psql "${POSTGRES_DSN}" -v ON_ERROR_STOP=1 -f "${file}"
  psql "${POSTGRES_DSN}" -v ON_ERROR_STOP=1 -c "INSERT INTO schema_migrations(version) VALUES ('${version}')"
done

echo "Schema migrations complete"

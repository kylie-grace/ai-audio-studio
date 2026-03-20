-- Create additional databases needed by services.
-- This file runs BEFORE init.sql (alphabetical order in entrypoint).
-- Must run as postgres superuser (Docker default).

-- n8n requires its own database separate from the studio schema.
SELECT 'CREATE DATABASE n8ndb'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'n8ndb')\gexec

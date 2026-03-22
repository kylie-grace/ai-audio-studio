ALTER TABLE worker_nodes
  ADD COLUMN IF NOT EXISTS workstation_profile JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE worker_nodes
  ADD COLUMN IF NOT EXISTS workstation_status JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS workstation_plugins (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_slug   TEXT NOT NULL REFERENCES worker_nodes(slug) ON DELETE CASCADE,
  plugin_format TEXT NOT NULL,
  name          TEXT NOT NULL,
  vendor        TEXT,
  version       TEXT,
  path          TEXT NOT NULL,
  file_name     TEXT NOT NULL,
  installed     BOOLEAN NOT NULL DEFAULT true,
  source_root   TEXT,
  size_bytes    BIGINT,
  modified_at   TIMESTAMPTZ,
  discovered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(worker_slug, path)
);

CREATE TABLE IF NOT EXISTS listening_reports (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  target          TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'preview',
  reference_count INTEGER NOT NULL DEFAULT 0,
  payload         JSONB NOT NULL DEFAULT '{}'::jsonb,
  summary         JSONB NOT NULL DEFAULT '{}'::jsonb,
  next_actions    JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by      TEXT NOT NULL DEFAULT 'system',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS render_reviews (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id            UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  target                TEXT NOT NULL,
  status                TEXT NOT NULL DEFAULT 'preview',
  review_candidate_slug TEXT,
  payload               JSONB NOT NULL DEFAULT '{}'::jsonb,
  follow_up             JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by            TEXT NOT NULL DEFAULT 'system',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

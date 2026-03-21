"""asyncpg connection pool with FastAPI lifespan management."""
import os
from contextlib import asynccontextmanager
from typing import AsyncGenerator

import asyncpg
from fastapi import FastAPI

_pool: asyncpg.Pool | None = None


async def ensure_runtime_schema(pool: asyncpg.Pool) -> None:
    await pool.execute(
        """ALTER TABLE worker_nodes
           ADD COLUMN IF NOT EXISTS workstation_profile JSONB NOT NULL DEFAULT '{}'::jsonb"""
    )
    await pool.execute(
        """ALTER TABLE worker_nodes
           ADD COLUMN IF NOT EXISTS workstation_status JSONB NOT NULL DEFAULT '{}'::jsonb"""
    )
    await pool.execute(
        """CREATE TABLE IF NOT EXISTS workstation_plugins (
               id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
               worker_slug  TEXT NOT NULL REFERENCES worker_nodes(slug) ON DELETE CASCADE,
               plugin_format TEXT NOT NULL,
               name         TEXT NOT NULL,
               vendor       TEXT,
               version      TEXT,
               path         TEXT NOT NULL,
               file_name    TEXT NOT NULL,
               installed    BOOLEAN NOT NULL DEFAULT true,
               source_root  TEXT,
               size_bytes   BIGINT,
               modified_at  TIMESTAMPTZ,
               discovered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
               updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
               UNIQUE(worker_slug, path)
           )"""
    )
    await pool.execute(
        """CREATE TABLE IF NOT EXISTS listening_reports (
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
           )"""
    )
    await pool.execute(
        """CREATE TABLE IF NOT EXISTS render_reviews (
               id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
               project_id            UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
               target                TEXT NOT NULL,
               status                TEXT NOT NULL DEFAULT 'preview',
               review_candidate_slug TEXT,
               payload               JSONB NOT NULL DEFAULT '{}'::jsonb,
               follow_up             JSONB NOT NULL DEFAULT '[]'::jsonb,
               created_by            TEXT NOT NULL DEFAULT 'system',
               created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
           )"""
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _pool
    dsn = os.environ["POSTGRES_DSN"]
    _pool = await asyncpg.create_pool(dsn, min_size=2, max_size=10)
    await ensure_runtime_schema(_pool)
    app.state.pool = _pool
    yield
    if _pool:
        await _pool.close()


async def get_pool() -> asyncpg.Pool:
    if _pool is None:
        raise RuntimeError("DB pool not initialized. Is lifespan running?")
    return _pool

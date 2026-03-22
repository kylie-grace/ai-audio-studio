"""asyncpg connection pool with FastAPI lifespan management."""
import os
from contextlib import asynccontextmanager
from typing import AsyncGenerator

import asyncpg
from fastapi import FastAPI

_pool: asyncpg.Pool | None = None
REQUIRED_SCHEMA_MIGRATION = os.environ.get("REQUIRED_SCHEMA_MIGRATION", "001-runtime-schema")


async def require_schema_migration(pool: asyncpg.Pool) -> None:
    table_present = await pool.fetchval("SELECT to_regclass('public.schema_migrations')")
    if table_present is None:
        raise RuntimeError("schema_migrations is missing. Run infra/db/run_migrations.sh before starting project-state.")
    applied = await pool.fetchval(
        "SELECT 1 FROM schema_migrations WHERE version=$1",
        REQUIRED_SCHEMA_MIGRATION,
    )
    if applied != 1:
        raise RuntimeError(
            f"Required schema migration {REQUIRED_SCHEMA_MIGRATION} has not been applied. "
            "Run infra/db/run_migrations.sh before starting project-state."
        )


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _pool
    dsn = os.environ["POSTGRES_DSN"]
    _pool = await asyncpg.create_pool(dsn, min_size=2, max_size=10)
    await require_schema_migration(_pool)
    app.state.pool = _pool
    yield
    if _pool:
        await _pool.close()


async def get_pool() -> asyncpg.Pool:
    if _pool is None:
        raise RuntimeError("DB pool not initialized. Is lifespan running?")
    return _pool

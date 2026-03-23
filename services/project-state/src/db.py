"""asyncpg connection pool with FastAPI lifespan management."""
import asyncio
import os
from contextlib import asynccontextmanager, suppress

import asyncpg
from fastapi import FastAPI

_pool: asyncpg.Pool | None = None
REQUIRED_SCHEMA_MIGRATION = os.environ.get("REQUIRED_SCHEMA_MIGRATION", "001-runtime-schema")
LEASE_SWEEP_INTERVAL_SECONDS = int(os.environ.get("LEASE_SWEEP_INTERVAL_SECONDS", "30"))


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
    _pool = await asyncpg.create_pool(dsn, min_size=2, max_size=10, statement_cache_size=0)
    await require_schema_migration(_pool)
    app.state.pool = _pool
    from .routers.workers import recover_expired_claims

    async def lease_recovery_loop() -> None:
        while True:
            try:
                if _pool is not None:
                    await recover_expired_claims(_pool)
            except Exception:
                # Keep recovery non-fatal; runtime recovery endpoints still expose details.
                pass
            await asyncio.sleep(LEASE_SWEEP_INTERVAL_SECONDS)

    recovery_task = asyncio.create_task(lease_recovery_loop(), name="project-state-lease-recovery")
    try:
        yield
    finally:
        recovery_task.cancel()
        with suppress(asyncio.CancelledError):
            await recovery_task
        if _pool:
            await _pool.close()


async def get_pool() -> asyncpg.Pool:
    if _pool is None:
        raise RuntimeError("DB pool not initialized. Is lifespan running?")
    return _pool

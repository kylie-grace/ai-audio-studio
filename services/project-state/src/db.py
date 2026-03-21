"""asyncpg connection pool with FastAPI lifespan management."""
import os
from contextlib import asynccontextmanager
from typing import AsyncGenerator

import asyncpg
from fastapi import FastAPI

_pool: asyncpg.Pool | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _pool
    dsn = os.environ["POSTGRES_DSN"]
    _pool = await asyncpg.create_pool(dsn, min_size=2, max_size=10)
    app.state.pool = _pool
    yield
    if _pool:
        await _pool.close()


async def get_pool() -> asyncpg.Pool:
    if _pool is None:
        raise RuntimeError("DB pool not initialized. Is lifespan running?")
    return _pool

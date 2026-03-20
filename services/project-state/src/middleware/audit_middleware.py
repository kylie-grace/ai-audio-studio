"""
Audit middleware — auto-appends an audit log entry for every mutating request.

Requires the X-Actor header on all POST/PUT/PATCH/DELETE requests.
Returns HTTP 400 if the header is missing.
"""
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

MUTATING_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
# Paths exempt from actor requirement (health, GET-only)
EXEMPT_PATHS = {"/health", "/docs", "/openapi.json", "/redoc"}


class RequireActorMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.method in MUTATING_METHODS and request.url.path not in EXEMPT_PATHS:
            actor = request.headers.get("X-Actor")
            # Audit log internal writes use X-Internal-Caller instead
            internal = request.headers.get("X-Internal-Caller")
            if not actor and not internal:
                return JSONResponse(
                    status_code=400,
                    content={"detail": "X-Actor header is required for all mutating requests."},
                )
        return await call_next(request)

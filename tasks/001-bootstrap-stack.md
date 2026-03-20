# Task 001 — Bootstrap Docker Compose Stack

## Purpose and Scope
Create the full Docker Compose service graph, environment variable contracts,
stub Dockerfiles, and health checks. No business logic. Goal: reproducible
local stack that any coding agent can start from a clean clone.

## Dependencies
- Docker Desktop installed on Mac mini
- No prior services running on ports 3000, 5432, 5678, 8080, 8090, 8100, 8110, 8120, 11434

## Files to Create or Modify
- `infra/docker-compose.yml` ← already created
- `infra/env.example` ← already created
- `infra/db/init.sql` ← already created
- `infra/.env` (from env.example, fill in real values — not committed)
- `services/*/Dockerfile` — stub Dockerfiles for each service
- `services/ollama/pull_models.sh` — model pull script
- `services/ollama/models.manifest.json` — declares required models
- `apps/studio-brain-ui/Dockerfile` — static nginx serving Vite build
- `README.md` ← already created

## Input/Output Contract
- Input: Clean machine with Docker Desktop, filled `infra/.env`
- Output: All services report healthy via `docker compose ps`

## Security Constraints
- No secrets in `docker-compose.yml`; all secrets via env vars
- Ports bound to 127.0.0.1 only (no public exposure)
- Ollama bound to Docker internal network only

## Stub Dockerfile Pattern (Python services)
```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY src/ ./src/
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8080"]
```

## Ollama Model Manifest
```json
{
  "models": [
    {"name": "qwen2.5:14b-instruct", "role": "planner", "min_ram_gb": 10},
    {"name": "qwen2.5:3b",           "role": "classifier", "min_ram_gb": 2},
    {"name": "nomic-embed-text",     "role": "embedding", "min_ram_gb": 1}
  ]
}
```

## Acceptance Tests
1. `docker compose -f infra/docker-compose.yml up -d` succeeds without error
2. `docker compose -f infra/docker-compose.yml ps` shows all services healthy
3. `curl http://localhost:5678/healthz` → HTTP 200
4. `curl http://localhost:8080/health` → `{"status":"ok"}`
5. `curl http://localhost:8090/health` → `{"status":"ok"}`
6. `curl http://localhost:8100/health` → `{"status":"ok"}`
7. `curl http://localhost:11434/api/tags` → JSON with model list
8. `curl http://localhost:3000` → HTML page

## Definition of Done
Any developer can run:
```bash
cp infra/env.example infra/.env
# fill in passwords
bash services/ollama/pull_models.sh
docker compose -f infra/docker-compose.yml up -d
```
and reach all service UIs. README documents this exactly.

# Runbook: Starting the Studio Brain

## Prerequisites
- Mac mini powered on
- Docker Desktop running (check menu bar icon)
- `/Volumes/StudioShare/` mounted (shared volume from NAS or studio Mac)

## Start the stack

```bash
cd ~/studio-ai-platform

# First time only: pull Ollama models (~10-30 min)
bash services/ollama/pull_models.sh

# Optional: expose the dashboard and APIs to your LAN
# Set BIND_HOST=0.0.0.0 in infra/.env before starting

# Start the Mac mini control plane
docker compose --env-file infra/.env -f infra/docker-compose.yml up -d

# Watch logs during startup
docker compose --env-file infra/.env -f infra/docker-compose.yml logs -f
```

## Verify everything is healthy

```bash
docker compose --env-file infra/.env -f infra/docker-compose.yml ps
# All services should show "healthy"

# Quick health check script
curl -sf http://localhost:5678/healthz && echo "n8n OK"
curl -sf http://localhost:8080/health && echo "project-state OK"
curl -sf http://localhost:8090/health && echo "crm-api OK"
curl -sf http://localhost:8100/health && echo "openclaw OK"
curl -sf http://localhost:11434/api/tags && echo "ollama OK"
```

## Access UIs
- **Studio Brain UI** (approval queue): http://localhost:3000
- **n8n workflows**: http://localhost:5678 (login: see infra/.env N8N_USER/N8N_PASSWORD)
- **LAN dashboard**: `http://<mac-mini-lan-ip>:3000` when `BIND_HOST=0.0.0.0`
- **Studio worker runbook**: see [studio-worker.md](/Users/kpsnyder/ai-audio-studio/docs/runbooks/studio-worker.md)

## Stop the stack

```bash
docker compose --env-file infra/.env -f infra/docker-compose.yml down
# Data is preserved in Docker named volumes
```

## Hard restart (keeps data)

```bash
docker compose --env-file infra/.env -f infra/docker-compose.yml restart
```

## Full reset (DESTROYS DATA — only for dev)

```bash
docker compose --env-file infra/.env -f infra/docker-compose.yml down -v
```

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

# Start the local control plane
docker compose --env-file infra/.env -f infra/docker-compose.yml up -d

# First-time only: import the starter n8n workflow pack
# This is a one-shot helper that runs against the live n8n container.
bash scripts/bootstrap_n8n.sh infra/.env

# Optional: include the local worker when one Mac should also execute worker tasks
docker compose --profile local-worker --env-file infra/.env -f infra/docker-compose.yml up -d

# Watch logs during startup
docker compose --env-file infra/.env -f infra/docker-compose.yml logs -f
```

Optional HTTPS front door for the dashboard:

```bash
docker compose --env-file infra/.env \
  -f infra/docker-compose.yml \
  -f infra/docker-compose.edge.yml \
  up -d
```

This enables Caddy at `https://$CONTROL_PLANE_HOST` with an internal TLS certificate for LAN use.
Export the root certificate with `bash scripts/export_caddy_root_cert.sh infra/.env` and trust it on operator Macs for warning-free HTTPS.

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
- **Studio Brain UI**: http://localhost:3000
- **n8n workflows**: http://localhost:5678 (login: see `infra/.env` `N8N_USER`/`N8N_PASSWORD`)
- **LAN dashboard**: `http://<mac-mini-lan-ip>:3000` when `BIND_HOST=0.0.0.0`
- **HTTPS dashboard**: `https://$CONTROL_PLANE_HOST` when using `docker-compose.edge.yml`
- **Starter workflow webhooks**: `/webhook/studio/...` paths appear after the one-shot `bash scripts/bootstrap_n8n.sh infra/.env` helper succeeds
- **Split-worker runbook**: see [studio-worker.md](/Users/kpsnyder/ai-audio-studio/docs/runbooks/studio-worker.md)
- **LAN/TLS runbook**: see [local-network.md](/Users/kpsnyder/ai-audio-studio/docs/runbooks/local-network.md)
- **n8n import runbook**: see [n8n-bootstrap.md](/Users/kpsnyder/ai-audio-studio/docs/runbooks/n8n-bootstrap.md)

If you are running a single Mac, stop here. `docker-compose.worker.yml` is optional and only needed for a second workstation.

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

# Runbook: Starting The Studio Brain

## Prerequisites

- Mac mini or primary studio Mac powered on
- Docker Desktop running
- `/Volumes/StudioShare/` mounted if you are using shared project paths
- `infra/.env` created from `infra/env.example`

## Start The Stack

```bash
cd ~/studio-ai-platform

# First time only: pull Ollama models (~10-30 min)
bash services/ollama/pull_models.sh

# For full-LAN access, set BIND_HOST=0.0.0.0 in infra/.env before starting

# Start the local control plane
docker compose --env-file infra/.env -f infra/docker-compose.yml up -d

# First-time only: import the starter n8n workflow pack
bash scripts/bootstrap_n8n.sh infra/.env

# Optional: include the local worker when one Mac should also execute worker tasks
docker compose --profile local-worker --env-file infra/.env -f infra/docker-compose.yml up -d

# Watch logs during startup if needed
docker compose --env-file infra/.env -f infra/docker-compose.yml logs -f
```

Optional HTTPS front door:

```bash
docker compose --env-file infra/.env \
  -f infra/docker-compose.yml \
  -f infra/docker-compose.edge.yml \
  up -d
```

Use the edge stack when you want a hostname-based HTTPS front door for operators.

## First Access Path

Use this order:

1. Verify local access on the control-plane machine.
2. Verify LAN access by IP from another machine.
3. Add hostname/TLS if desired.
4. Move operator usage to the hostname URL after trust is in place.

## Verify Everything Is Healthy

```bash
docker compose --env-file infra/.env -f infra/docker-compose.yml ps
# Core services should show healthy once startup settles

curl -sf http://localhost:5678/healthz && echo "n8n OK"
curl -sf http://localhost:8080/health && echo "project-state OK"
curl -sf http://localhost:8090/health && echo "crm-api OK"
curl -sf http://localhost:8100/health && echo "openclaw OK"
curl -sf http://localhost:11434/api/tags && echo "ollama OK"
```

From another machine on the LAN when `BIND_HOST=0.0.0.0`:

```bash
curl -sf http://<control-plane-ip>:3000 >/dev/null && echo "dashboard reachable"
curl -sf http://<control-plane-ip>:5678/healthz && echo "n8n reachable"
```

## Access UIs

Local machine:
- Studio Brain UI: `http://localhost:3000`
- n8n workflows: `http://localhost:5678`

LAN by IP:
- Dashboard: `http://<control-plane-ip>:3000`
- n8n: `http://<control-plane-ip>:5678`
- project-state: `http://<control-plane-ip>:8080`
- crm-api: `http://<control-plane-ip>:8090`
- openclaw: `http://<control-plane-ip>:8100`

Hostname/TLS:
- Dashboard: `https://$CONTROL_PLANE_HOST`
- n8n: `https://n8n.$CONTROL_PLANE_HOST`
- OpenClaw: `https://openclaw.$CONTROL_PLANE_HOST`

Notes:
- Starter workflow webhooks appear after `bash scripts/bootstrap_n8n.sh infra/.env`
- The dashboard is the preferred operator entrypoint
- Direct service ports remain valid for engineering and worker traffic

## Hostname And TLS Posture

Hostname/TLS is recommended, not required.

Use it when:
- you want one clean operator URL
- you want browser-friendly HTTPS on the LAN
- you are onboarding non-technical operators

Stay on IP access when:
- you are still bringing the machine up
- local DNS or hosts entries are not ready yet
- you have not trusted the Caddy root certificate

See:
- [local-network.md](/Users/kpsnyder/ai-audio-studio/docs/runbooks/local-network.md)
- [legacy-cutover.md](/Users/kpsnyder/ai-audio-studio/docs/runbooks/legacy-cutover.md)
- [n8n-bootstrap.md](/Users/kpsnyder/ai-audio-studio/docs/runbooks/n8n-bootstrap.md)
- [studio-worker.md](/Users/kpsnyder/ai-audio-studio/docs/runbooks/studio-worker.md)

If you are running a single Mac, stop here. `docker-compose.worker.yml` is optional and only needed for a second workstation.

## Stop The Stack

```bash
docker compose --env-file infra/.env -f infra/docker-compose.yml down
```

## Hard Restart

```bash
docker compose --env-file infra/.env -f infra/docker-compose.yml restart
```

## Full Reset

```bash
docker compose --env-file infra/.env -f infra/docker-compose.yml down -v
```

This destroys local Docker data and should only be used for development reset work.

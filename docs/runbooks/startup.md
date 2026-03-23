# Runbook: Starting The Studio Brain

## Prerequisites

- Primary host Mac powered on
- Docker Desktop running
- Ollama installed natively on the Mac that will host LLM inference
- `/Volumes/StudioShare/` mounted if you are using shared project paths
- `infra/.env` created from `infra/env.example`
- `python3 -m pip install -r requirements-test.txt` if you want the full API test suite to exercise the optional FastAPI/asyncpg surfaces instead of import-skipping them

## Deployment Posture First

Choose one of these before you start:

- `single_machine`
  - one Mac runs the control plane
- `single_machine + local-worker`
  - one Mac runs the control plane and the local worker profile
- `control_plane_plus_worker`
  - one Mac runs the control plane and a second machine gets added later as a worker

Recommended first run: `single_machine`

## Start The Control Plane

```bash
cd ~/ai-audio-studio

# Start native Ollama and pull the required models
export OLLAMA_MAX_LOADED_MODELS=1
export OLLAMA_KEEP_ALIVE=30m
bash scripts/start-ollama.sh

# Optional: install native Ollama as a login item
cp scripts/com.ai-audio-studio.ollama.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.ai-audio-studio.ollama.plist

# For full-LAN access, set BIND_HOST=0.0.0.0 in infra/.env before starting

# Start the control plane
docker compose --env-file infra/.env -f infra/docker-compose.yml up -d

# Add the DAW profile when you want the DAW-oriented services too
docker compose --profile daw --env-file infra/.env -f infra/docker-compose.yml up -d

# First-time only: import the starter n8n workflow pack
bash scripts/bootstrap_n8n.sh infra/.env

# Optional: include the local worker when this same machine should execute worker tasks
docker compose --profile local-worker --env-file infra/.env -f infra/docker-compose.yml up -d

# Watch logs during startup if needed
docker compose --env-file infra/.env -f infra/docker-compose.yml logs -f
```

The main stack now includes the HTTPS front door and schema-migration runner. `docker-compose.edge.yml` remains as a compatibility overlay, not the preferred bring-up path.

If you want a second worker machine, do that after the control plane is healthy by following [studio-worker.md](studio-worker.md). Remote worker bring-up is intentionally a second step, not part of the initial critical path.

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
- Dashboard: `https://$STUDIO_DOMAIN`
- API-backed services: `https://$STUDIO_DOMAIN/api/<service>`
- n8n: `https://$STUDIO_DOMAIN/n8n` or `https://n8n.$STUDIO_DOMAIN`
- OpenClaw: `https://$STUDIO_DOMAIN/openclaw` or `https://openclaw.$STUDIO_DOMAIN`

Notes:
- Starter workflow webhooks appear after `bash scripts/bootstrap_n8n.sh infra/.env`
- Internal n8n starters are activated during bootstrap reconciliation; credential-gated outbound flows stay disabled until credentials exist
- The dashboard is the preferred operator entrypoint
- Direct service ports remain valid for engineering and worker traffic
- Single-machine bring-up is the primary success path; remote worker setup is additive

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
- [local-network.md](local-network.md)
- [legacy-cutover.md](legacy-cutover.md)
- [n8n-bootstrap.md](n8n-bootstrap.md)
- [studio-worker.md](studio-worker.md)
- [../gmail-oauth-setup.md](../gmail-oauth-setup.md)
- [../reascript-integration.md](../reascript-integration.md)

If you are running `single_machine`, stop here. `docker-compose.worker.yml` is optional and only needed for `control_plane_plus_worker`.

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

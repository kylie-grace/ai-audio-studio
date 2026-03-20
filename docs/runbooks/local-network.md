# Runbook: Local Network And HTTPS

## Goal

Expose Studio Brain cleanly on the local network with one HTTPS operator URL, proxied control-plane APIs behind the dashboard, and direct ports kept mostly for engineering and worker traffic.

## Configure

1. Copy `infra/env.example` to `infra/.env`.
2. Set `BIND_HOST=0.0.0.0`.
3. Set `CONTROL_PLANE_HOST` to the hostname operators should use, such as `studio-brain.local`.
4. Set `N8N_WEBHOOK_URL` to the LAN URL webhook sources should hit.

## Start

```bash
docker compose --env-file infra/.env \
  -f infra/docker-compose.yml \
  -f infra/docker-compose.edge.yml \
  up -d
```

## Trust The Caddy LAN Certificate

The edge stack uses Caddy `tls internal`, which creates a private CA for your LAN.

Export the root certificate:

```bash
bash scripts/export_caddy_root_cert.sh infra/.env
```

This writes `infra/caddy-root.crt`. Import that certificate into the login keychain on each operator Mac and mark it trusted.

## Access Pattern

- Primary operator URL: `https://$CONTROL_PLANE_HOST`
- n8n over HTTPS: `https://n8n.$CONTROL_PLANE_HOST`
- OpenClaw over HTTPS: `https://openclaw.$CONTROL_PLANE_HOST`
- Dashboard fallback: `http://<mac-ip>:3000`
- n8n editor: `http://<mac-ip>:5678`
- APIs and worker registration stay on their direct ports

## Notes

- The dashboard is the main front door. It proxies the control-plane APIs and internal service health so novice operators do not need to memorize raw ports.
- HTTPS is real, but it uses a private LAN CA from Caddy. Until `infra/caddy-root.crt` is imported and trusted on the operator Mac, browsers will warn.
- Dedicated `n8n` and `openclaw` HTTPS subdomains remain available for deeper administration. Direct API and worker ports remain plain HTTP on the LAN.
- Keep `OPERATOR_API_TOKEN` and `WORKER_API_TOKEN` set before exposing the stack beyond localhost.
- Single-machine mode is valid. A second worker Mac is optional.

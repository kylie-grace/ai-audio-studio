# Runbook: Local Network And HTTPS

## Goal

Expose `ai-audio-studio` cleanly on the local network with:
- immediate full-LAN access by IP
- an optional hostname-based HTTPS front door for operators
- direct service ports preserved for engineering and worker traffic

## Network Posture

Use these layers intentionally:

- `IP + HTTP` is the fastest bring-up path.
  Example: `http://192.168.1.50:3000`
- `Hostname + HTTPS` is the preferred day-to-day operator path once local DNS or hosts entries are in place.
  Example: `https://studio-brain.local`
- `Path-based front-door routes` are the default semantic access pattern once Caddy is live.
  Example: `https://studio-brain.local/api/project-state`
- `Direct ports` remain valid for engineering, debugging, and worker callbacks.
  Examples: `:5678`, `:8080`, `:8090`, `:8100`, `:8190`
- `single_machine` is the default bring-up path; `control_plane_plus_worker` is the split deployment when a second Mac is available.

Recommended operator progression:
1. Start with IP access and confirm the dashboard loads.
2. Add the HTTPS edge stack.
3. Point the hostname at the control-plane machine.
4. Trust the Caddy root certificate on operator devices.
5. Move normal operator access to the hostname URL.

## Configure

1. Copy `infra/env.example` to `infra/.env`.
2. Set `BIND_HOST=0.0.0.0`.
3. Set `STUDIO_DOMAIN` to the hostname operators should use, such as `studio-brain.local`. Keep `CONTROL_PLANE_HOST` aligned if you still rely on older docs or scripts.
4. Set `N8N_WEBHOOK_URL` to the LAN or HTTPS front-door URL webhook sources should hit.
   Example: `http://192.168.1.50:5678` or `https://studio-brain.local/n8n`
5. Keep `OPERATOR_API_TOKEN` and `WORKER_API_TOKEN` set before exposing the stack beyond localhost.

## Start With Full-LAN IP Access

```bash
docker compose --env-file infra/.env \
  -f infra/docker-compose.yml \
  up -d
```

Verify from another machine on the same network:

```bash
curl -sf http://<control-plane-ip>:3000 >/dev/null && echo "dashboard reachable"
curl -sf http://<control-plane-ip>:5678/healthz && echo "n8n reachable"
curl -sf http://<control-plane-ip>:8080/health && echo "project-state reachable"
curl -sf http://<control-plane-ip>:8090/health && echo "crm-api reachable"
curl -sf http://<control-plane-ip>:8100/health && echo "openclaw reachable"
```

Immediate access pattern:
- Dashboard: `http://<control-plane-ip>:3000`
- n8n: `http://<control-plane-ip>:5678`
- project-state: `http://<control-plane-ip>:8080`
- crm-api: `http://<control-plane-ip>:8090`
- openclaw: `http://<control-plane-ip>:8100`

## Add Hostname And HTTPS

Start the edge stack:

```bash
docker compose --env-file infra/.env \
  -f infra/docker-compose.yml \
  -f infra/docker-compose.edge.yml \
  up -d
```

This enables Caddy with `tls internal` for LAN use.

If you also want the DAW-oriented services during bring-up, add the `daw` profile:

```bash
docker compose --profile daw --env-file infra/.env \
  -f infra/docker-compose.yml \
  up -d
```

## Point The Hostname

`STUDIO_DOMAIN` must resolve to the control-plane machine.

Choose one:
- local DNS on the router, Pi-hole, or internal DNS
- `/etc/hosts` entry on each operator machine

Example hosts entry:

```text
192.168.1.50 studio-brain.local n8n.studio-brain.local openclaw.studio-brain.local
```

## Trust The Caddy LAN Certificate

Export the root certificate:

```bash
bash scripts/export_caddy_root_cert.sh infra/.env
```

This writes `infra/caddy-root.crt`.

Import that certificate into the login keychain on each operator Mac and mark it trusted.

Until that certificate is trusted:
- `https://$STUDIO_DOMAIN` will load with browser warnings
- `http://<control-plane-ip>:3000` remains the clean fallback

## Access Pattern

Preferred operator URLs:
- Dashboard: `https://$STUDIO_DOMAIN`
- API-backed services: `https://$STUDIO_DOMAIN/api/<service>`
- n8n: `https://$STUDIO_DOMAIN/n8n` or `https://n8n.$STUDIO_DOMAIN`
- OpenClaw: `https://$STUDIO_DOMAIN/openclaw` or `https://openclaw.$STUDIO_DOMAIN`

Fallback URLs:
- Dashboard: `http://<control-plane-ip>:3000`
- n8n: `http://<control-plane-ip>:5678`
- OpenClaw: `http://<control-plane-ip>:8100`

Engineering and worker traffic:
- direct ports remain plain HTTP on the LAN
- `studio-worker` should point at the control-plane machine by IP or resolvable hostname

## Notes

- The dashboard is the main front door. It proxies control-plane APIs so novice operators do not need to memorize raw ports.
- Full-network IP access is the baseline deployment posture when `BIND_HOST=0.0.0.0`.
- Hostname/TLS is the polish layer, not a prerequisite for first successful bring-up.
- `single_machine` is valid. A second worker Mac is optional.
- If you are replacing an older host or legacy dashboard, follow [legacy-cutover.md](legacy-cutover.md) before retiring it.

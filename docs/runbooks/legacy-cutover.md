# Runbook: Legacy Cutover

## Goal

Move from older studio automation or dashboard infrastructure to `ai-audio-studio` without leaving operators split across two systems.

This runbook assumes:
- the new control plane is already running
- you can reach it by IP on the LAN
- you want a clean handoff to the new dashboard and hostname

## Cutover Principles

- Cut over the operator entrypoint first.
- Keep direct ports available for engineering until confidence is high.
- Do not shut down legacy infrastructure until the new stack is reachable by both IP and the intended hostname.
- Prefer one control-plane machine over a partially active old/new split.

## Before You Cut Over

Confirm:
- `docker compose ... ps` shows the new control plane healthy
- `http://<control-plane-ip>:3000` loads from another machine on the LAN
- `bash scripts/bootstrap_n8n.sh infra/.env` has been run successfully
- the workspace questionnaire has been completed in the new dashboard
- any optional worker machine knows the new control-plane base URL

If you plan to use HTTPS:
- `CONTROL_PLANE_HOST` resolves to the new control-plane machine
- the Caddy root certificate has been exported and trusted on operator Macs
- `https://$CONTROL_PLANE_HOST` loads cleanly

## Recommended Cutover Order

1. Bring up the new stack and verify it by IP.
2. Import n8n starter workflows and confirm they exist.
3. Complete workspace settings in the new dashboard.
4. If using HTTPS, enable the edge stack and trust the certificate.
5. Point the operator-facing hostname or bookmark to the new dashboard.
6. Update any worker or webhook source to target the new control-plane machine.
7. Stop using the legacy dashboard for day-to-day operations.
8. Leave legacy infrastructure powered but idle for a short validation window.
9. Retire legacy infra only after the new stack has proven stable in normal use.

## What To Repoint

Operator-facing entrypoints:
- bookmarks to the dashboard
- any shared links/docs that point operators to the old UI

Webhook and automation sources:
- n8n sources that should now hit `http://<control-plane-ip>:5678` or `https://n8n.$CONTROL_PLANE_HOST`
- any external senders that depended on old webhook URLs

Worker-side references:
- `MAC_MINI_BASE_URL`
- any worker or DAW-side callback URLs
- shared path assumptions if the old host used different mounts

## Safe Validation Window

During cutover, keep these available:
- new dashboard by IP
- new dashboard by hostname if HTTPS is enabled
- direct service ports for engineering access
- legacy stack still available but not operator-primary

Watch for:
- missing webhook traffic
- hostname resolution problems
- certificate trust complaints on operator Macs
- workers still calling the old host
- team members opening the wrong dashboard from old bookmarks

## When To Retire Legacy Infra

Retire the old stack only when all of these are true:
- operators are using the new dashboard
- LAN IP access works reliably
- hostname/TLS works if you intend to use it
- workers and webhook sources point at the new host
- there is no remaining dependency on old service URLs

## Notes

- Full-network IP access is the baseline safety net. Even if hostname/TLS work is incomplete, the new stack should still be usable at `http://<control-plane-ip>:3000`.
- Hostname/TLS is the clean operator posture, but it should not block the initial cutover.
- If you are replacing a legacy multi-host setup, collapse operator access to one new control-plane machine first and then reintroduce optional worker nodes deliberately.

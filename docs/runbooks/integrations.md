# Runbook: Connections And Integrations

## Purpose

Use the control room `Settings` tab as the primary onboarding surface for external connections. The workspace status payload now ships a `connection_center` checklist so operators see exact next steps instead of raw integration booleans.

## What the connection center covers

- Operator front door
- n8n automation
- Gmail intake
- Gmail send
- Instagram publishing
- Facebook publishing
- Worker runtime

Each card includes:
- current readiness status
- the main target URL, token, or credential concept
- the required workspace fields
- the next two setup steps

## Turnkey operator flow

1. Open the dashboard `Settings` tab.
2. Review the `Connection Center` cards before editing the detailed workspace form.
3. Save the workspace settings so the stack has a persisted source of truth.
4. For n8n, run:

```bash
bash scripts/bootstrap_n8n.sh infra/env.example
```

5. For Gmail, create the Google OAuth clients first, then wire the credentials into the runtime env and n8n.
6. For social publishing, keep the integration scaffolded until the real account tokens are available and validated.
7. For worker runtime, use `Setup Validation` to validate, run the dry-run smoke rehearsal, and drain/resume the worker during maintenance.

## Notes by integration

### n8n

- The connection center assumes the packaged workflow set is the starting point.
- Use the front-door proxied n8n URL instead of teaching operators raw service ports.

### Gmail intake

- This is the lower-risk first Gmail connection.
- Enable it after the read-only OAuth client exists and the polling workflow is ready.

### Gmail send

- This depends on both Gmail send credentials and the approval-event routing webhook.
- Do not mark it ready until the n8n credential and webhook path are both real.

### Instagram and Facebook

- These remain scaffolded intentionally until real Meta credentials exist.
- Keep publishing approval-gated during first activation.

### Worker runtime

- Single-machine mode is already turnkey.
- Remote worker mode still requires the worker slug, API URL, and network reachability.
- Drain the worker before updates so no new tasks are claimed during maintenance.

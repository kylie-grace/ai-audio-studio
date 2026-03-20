# Runbook: n8n Bootstrap

## Goal

Bring up n8n with importable workflow templates so operators do not have to design the first-pass webhook flows by hand.

## Included Workflow Templates

- `infra/n8n/workflows/lead-source-new-lead.json`
- `infra/n8n/workflows/inbox-source-new-message.json`
- `infra/n8n/workflows/content-source-new-brief.json`
- `infra/n8n/workflows/session-source-import-stems.json`
- `infra/n8n/workflows/revision-source-notes-received.json`
- `infra/n8n/workflows/qc-source-qc-pass.json`

Each workflow terminates at `openclaw /dispatch/by-trigger`, which then applies the seeded rule packs and starter playbooks.

## Import

1. Start the stack normally.
2. Run the one-shot bootstrap helper:

```bash
bash scripts/bootstrap_n8n.sh infra/.env
```

3. The helper waits for the running `n8n` service to be healthy, then executes the importer inside that container.
4. If any workflows already exist in the n8n database, the helper exits cleanly and leaves them untouched.
5. Open n8n at `http://localhost:5678` or `http://<mac-ip>:5678`.
6. Confirm the `Lead Source New Lead`, `Inbox Source New Message`, `Content Source New Brief`, `Session Source Import Stems`, `Revision Source Notes Received`, and `QC Source QC Pass` workflows exist.
7. Adjust webhook paths, credentials, or upstream trigger sources only if your studio needs custom external integrations.
8. Activate the workflows only after validating OpenClaw health and dashboard visibility.

## Operator Expectation

The intended flow is:

1. n8n receives inbound events.
2. OpenClaw chooses the seeded route.
3. The target service drafts or prepares work.
4. `project-state` holds approval-required items until a human approves them.

## Notes

- These templates are starter workflows, not a full credentialed production automation set.
- Operators should not need to author orchestration rules; those are seeded in OpenClaw.
- The dashboard surfaces the same starter automation inventory through `openclaw /playbooks`.
- The importer runs as a one-shot helper against the live `n8n` service, so Docker Desktop will not show a stopped `n8n-import` container during normal operation.
- Re-running `bash scripts/bootstrap_n8n.sh infra/.env` is safe; it skips when the database already contains workflows.

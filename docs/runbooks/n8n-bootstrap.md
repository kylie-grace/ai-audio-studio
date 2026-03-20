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

1. Start the stack normally. The `n8n-import` bootstrap job imports the starter workflows automatically when the n8n database is still empty.
2. Open n8n at `http://localhost:5678` or `http://<mac-ip>:5678`.
3. Confirm the `Lead Source New Lead`, `Inbox Source New Message`, `Content Source New Brief`, `Session Source Import Stems`, `Revision Source Notes Received`, and `QC Source QC Pass` workflows exist.
4. Adjust webhook paths, credentials, or upstream trigger sources only if your studio needs custom external integrations.
5. Activate the workflows only after validating OpenClaw health and dashboard visibility.

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

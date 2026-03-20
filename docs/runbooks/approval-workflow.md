# Runbook: Approval Workflow

## Overview

Every AI-generated action that touches clients, social media, or audio
is held in the **approval queue** until Maggie reviews and approves it.
Nothing sends without a human "yes".

## Where to find items awaiting review

1. Open **Studio Brain UI**: http://localhost:3000
2. The **Approval Queue** tab shows all pending items grouped by type

## Item types and what to check

### Lead draft replies
- Is the artist name correct?
- Is the service type right?
- Does the draft sound like you? (Revise directly in UI if not)
- No pricing commitments? (Reject and rewrite if present)

### Inbox draft replies
- Correct classification? (lead / revision / scheduling / etc.)
- Appropriate urgency level?
- Draft body makes sense given the original email?

### Social captions
- Correct project reference?
- Caption sounds like your voice?
- Hashtags appropriate?
- Asset files attached correctly?

### Revision scripts
- Does the plain-English summary match what the client asked for?
- Any low-confidence changes flagged? (Resolve these first)
- Happy to hand this to engineer for execution?

## Approving

Click **Approve** next to any item. Your name is recorded in the audit log.
Approved email drafts go to the `approved-send` queue — a separate step
sends them (visible in n8n).

## Rejecting

Click **Reject** and write a brief reason. The item is permanently closed.
The worker will NOT retry. If the draft needs a rewrite, reject and trigger
a new run with better context.

## Escalation

If an item appears in the queue that you did not expect, or looks wrong:
1. Reject it immediately
2. Check `GET http://localhost:8080/audit-log?job_id=<id>` to see what triggered it
3. If it looks like a bug, check Docker logs: `docker compose logs openclaw`

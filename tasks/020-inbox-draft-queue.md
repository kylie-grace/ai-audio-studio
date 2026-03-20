# Task 020 — Inbox Draft Queue (Safe Email Triage)

## Purpose and Scope
Build safe email triage. Worker reads from approved Gmail labels (defined in env),
classifies each message, and writes draft responses to `inbox_drafts` table.
**Worker has NO send privileges. It cannot delete, archive, or move messages.**
Read-only on inbox, write-only to draft queue.

## Dependencies
- Task 001 complete
- Task 040 complete (project-state running)
- Gmail OAuth credentials configured in env (gmail.readonly scope only)
- n8n Gmail trigger node configured

## Files to Create or Modify
- `workers/inbox-triage/main.py`
- `workers/inbox-triage/classifier.py` — classify message type via LLM
- `workers/inbox-triage/drafter.py` — generate draft reply
- `workers/inbox-triage/gmail_reader.py` — gmail.readonly HTTP client
- `workers/inbox-triage/state_client.py`
- `workers/inbox-triage/requirements.txt`
- `workers/inbox-triage/Dockerfile`
- `services/openclaw-orchestrator/prompts/inbox-classify.txt`
- `services/openclaw-orchestrator/prompts/inbox-draft.txt`
- `services/n8n/workflows/inbox-triage-trigger.json`
- `infra/docker-compose.yml` — add inbox-triage service

## CRITICAL: Gmail OAuth Scope Constraint
The triage reader uses **gmail.readonly** scope only.
A separate `approved-send` service (Task 080) holds gmail.compose scope and
requires explicit human approval before every send. These two OAuth credentials
must NEVER be merged into a single credential set.

## Input Contract (from n8n Gmail trigger)
```json
{
  "thread_id": "gmail-thread-id",
  "message_id": "gmail-message-id",
  "subject": "...",
  "from": "sender@example.com",
  "body_text": "...",
  "labels": ["NeedsReply"],
  "received_at": "ISO-8601"
}
```

## Classification Categories
| Category | Description |
|----------|-------------|
| `lead` | New client inquiry (also trigger lead-intake if not already processed) |
| `revision-request` | Existing client requesting changes to mix/master |
| `scheduling` | Booking, rescheduling, session time questions |
| `payment` | Invoice, payment confirmation, financial matters |
| `admin` | Contracts, releases, licensing, general business |
| `noise` | Spam, newsletters, automated messages — draft = "no action needed" |

## Output Contract (row in inbox_drafts)
```json
{
  "source_thread": "thread_id",
  "message_type": "revision-request",
  "draft_body": "...",
  "draft_subject": "Re: ...",
  "classification": "high confidence: revision-request",
  "urgency": "high",
  "status": "pending-review"
}
```

## Deduplication
Before creating a new draft, check `inbox_drafts` for existing `source_thread`.
If a pending-review draft exists for that thread, skip creation and log.
Only create a new draft if the existing one was rejected or sent.

## Acceptance Tests
1. n8n Gmail trigger fires on new label → inbox-triage worker receives payload
2. Message classified into one of the 6 categories
3. Draft written to `inbox_drafts` with `status = pending-review`
4. Draft appears in Studio Brain UI inbox queue
5. Approving draft → status = approved (send happens via separate worker)
6. No `DELETE`, `PATCH`, or `POST` to Gmail API from this worker — ever
7. Duplicate thread ID → existing draft preserved, no second draft created
8. `noise` type messages get a "no action needed" draft body (not blank)

## Definition of Done
Gmail messages in watched labels are classified and drafted within 5 minutes
of receipt. All drafts appear in approval queue. Nothing sent or archived by
this worker. Audit log entries at Tier 1 (read) and Tier 2 (draft).

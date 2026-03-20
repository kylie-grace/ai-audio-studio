# Task 080 — Policy Guardrails and End-to-End Tests

## Purpose and Scope
Harden the system with policy enforcement middleware, implement the
approved-send worker (email sending only after human approval), add
cross-service integration tests, and validate all approval boundaries
are enforced. This is the final gate before the platform is used with
real clients.

## Dependencies
- Tasks 001–070 complete

## Files to Create or Modify
- `services/openclaw-orchestrator/src/policy.py` — permission tier enforcement
- `services/openclaw-orchestrator/src/guardrails.py` — action blocklist
- `workers/approved-send/main.py` — sends email ONLY on approved jobs
- `workers/approved-send/gmail_sender.py` — gmail.compose scope client
- `workers/approved-send/requirements.txt`
- `workers/approved-send/Dockerfile`
- `tests/integration/test_lead_to_send.py` — full lead intake → send flow
- `tests/integration/test_inbox_triage_flow.py`
- `tests/approval-boundary/test_no_bypass.py` — exhaustive bypass tests
- `docs/runbooks/startup.md`
- `docs/runbooks/approval-workflow.md`
- `docs/runbooks/incident-response.md`

## Policy Enforcement (policy.py)

Every OpenClaw action is checked against the policy before execution:

```python
TIER_PERMISSIONS = {
    1: {"read_file", "query_state", "read_email"},
    2: {"write_draft", "write_inbox_draft", "write_social_draft"},
    3: {"write_approval_queue", "create_job", "update_job_status"},
    4: {"organize_files", "write_session_template", "write_reascript"},
}

BLOCKLIST = {
    # These actions are NEVER allowed, regardless of tier
    "send_email_without_approval",
    "post_social_without_approval",
    "execute_daw_script_without_approval",
    "delete_project_files",
    "modify_delivered_files",
    "access_financial_records",
}

def check_permission(action: str, tier: int) -> None:
    if action in BLOCKLIST:
        raise PermissionError(f"Action '{action}' is in the permanent blocklist.")
    allowed = set().union(*[TIER_PERMISSIONS[t] for t in range(1, tier + 1)])
    if action not in allowed:
        raise PermissionError(f"Action '{action}' not permitted at tier {tier}.")
```

## Approved-Send Worker
The only component allowed to send emails. Runs on a dedicated OAuth credential
with gmail.compose scope. Before sending:
1. Fetches job from project-state API
2. Verifies `status = approved` AND `approved_by` is non-null AND `approved_at` is set
3. Verifies `approval_required = true` on the job
4. Verifies the draft content hasn't changed since approval
5. Sends via Gmail API
6. Updates `leads.draft_sent = true` or `inbox_drafts.status = sent`
7. Logs to audit_log with tier=3 and actor=`system:approved-send`

If ANY check fails → abort, log error, alert Maggie via Studio Brain UI.

## End-to-End Integration Tests

### test_lead_to_send.py
```
1. POST to /webhook/lead-intake with valid payload
2. Assert: job in approval queue with status=awaiting-approval
3. Assert: draft_sent=false in leads table
4. POST to /approval-queue/{job_id}/approve with X-Actor: maggie
5. Assert: job status=approved
6. Trigger approved-send worker
7. Assert: Gmail send API called exactly once with correct payload
8. Assert: draft_sent=true in leads table
9. Assert: audit log has 4 entries (intake, draft, queue, send)
```

### test_no_bypass.py (exhaustive approval boundary tests)
```
1. Direct POST to gmail send endpoint without approval → blocked
2. Set job status=complete without going through approval → FSM rejects
3. Attempt send with approved_by=null → approved-send aborts
4. Attempt execute ReaScript with job status=parsed → blocked
5. Attempt to post to social API → PermissionError (permanent blocklist)
6. Attempt to delete project files → PermissionError (permanent blocklist)
7. All blocklist actions return 403, logged to audit at tier=0 (violation)
```

## Runbook: startup.md
```markdown
## Starting the Studio Brain

1. Ensure Mac mini is powered on and Docker Desktop is running
2. cd ~/studio-ai-platform
3. docker compose -f infra/docker-compose.yml up -d
4. Verify: open http://localhost:3000 (Studio Brain UI)
5. Verify: open http://localhost:5678 (n8n workflows)
6. Check logs: docker compose logs -f openclaw

## Stopping
docker compose -f infra/docker-compose.yml down
# Data is preserved in named volumes
```

## Acceptance Tests
1. All unit tests pass: `docker compose run project-state pytest tests/unit/`
2. All integration tests pass
3. All approval boundary tests pass
4. No item in BLOCKLIST is reachable via any code path in the codebase (grep test)
5. Startup runbook works on a clean Docker Desktop installation
6. Incident response runbook reviewed and signed off

## Definition of Done
System is hardened. No path exists to send email, post content, or execute
audio scripts without human approval. All boundary tests pass. Runbooks complete.
Ready for use with real clients.

# Job FSM — State Machine Reference

**Written for:** Developer Contributor, advanced operator
**Purpose:** Complete reference for every state, transition, and trigger in the job FSM

---

## The State Machine

Every job in the system moves through a defined set of states. No job can skip states or move backwards. The FSM enforces the safety model — it's the technical implementation of "fail closed."

```
                    ┌─────────────┐
                    │   pending   │  ← Created by a module or webhook
                    └──────┬──────┘
                           │ system routes to appropriate module
                           ▼
                    ┌─────────────┐
                    │ in-progress │  ← Module is analyzing, drafting, or executing
                    └──────┬──────┘
                           │ module completes draft or analysis
                           ▼
               ┌───────────────────────┐
               │  awaiting-approval    │  ← Waiting for human decision
               └───────────┬───────────┘
                           │
             ┌─────────────┴─────────────┐
             │                           │
    human approves                  human rejects
             │                           │
             ▼                           ▼
        ┌──────────┐              ┌──────────────┐
        │ approved │              │   rejected   │  (terminal)
        └────┬─────┘              └──────────────┘
             │ action executed or send completed
             ▼
        ┌──────────┐
        │ complete │  (terminal)
        └──────────┘

     ┌──────────┐
     │  failed  │  (terminal, can occur from in-progress or approved)
     └──────────┘
```

---

## State Definitions

### `pending`

**Meaning:** Job has been created and is waiting to be routed to a module.

**Created by:** Webhook submission, n8n workflow dispatch, operator API call, or another module triggering a downstream job.

**Transitions to:** `in-progress` when OpenClaw routes the job to the appropriate module.

**What's blocked:** All downstream processing. The job exists but nothing has acted on it yet.

---

### `in-progress`

**Meaning:** A module has claimed the job and is actively processing it — analyzing, drafting, measuring, or executing.

**Triggered by:** OpenClaw dispatch to a module; or worker claiming a task.

**Transitions to:**
- `awaiting-approval` — when the module completes its work and has produced output requiring human review
- `failed` — if the module encounters an unrecoverable error

**What's blocked:** Any further routing. The module that claimed this job is responsible for moving it forward.

**What can happen during this state:** LLM calls, file operations, audio measurements. All intermediate work.

---

### `awaiting-approval`

**Meaning:** The module has completed its work. Output is ready. Waiting for explicit human approval or rejection.

**Triggered by:** Module completing draft/analysis and calling the approval-queue endpoint.

**Transitions to:**
- `approved` — when operator clicks Approve in the dashboard (or approves via API with correct `X-Actor`)
- `rejected` — when operator clicks Reject

**What's blocked:** Outbound actions. Email will not send. DAW scripts will not execute. Social content will not post. Nothing proceeds.

**Expiry:** After `MAX_DRAFT_AGE_HOURS` (default: 48), the job is removed from the queue. It moves to `failed` with reason `draft_expired`. **It does not automatically proceed.**

**Persistence:** The job and its associated draft/plan are stored in the database. Closing the browser, restarting services, or rebooting does not lose the pending approval.

---

### `approved`

**Meaning:** A human operator with an authorized actor identity has explicitly approved this job.

**Triggered by:** Approval API call with valid `X-Actor` header matching `AUTHORIZED_ACTORS`.

**Transitions to:**
- `complete` — when the downstream action (send email, post social, execute DAW script) completes successfully
- `failed` — if the downstream action fails

**What happens:** The send worker or execution worker picks up this job, independently re-verifies the approved state in the FSM (defense in depth), and executes the action.

**The double-check:** The send worker does not trust a passed parameter saying "this was approved." It queries project-state directly to confirm the job is in `approved` state before acting. If for any reason the state doesn't confirm, it aborts.

---

### `rejected`

**Meaning:** A human operator has explicitly rejected this job. It will never proceed.

**Terminal state** — no transitions out of this state.

**Triggered by:** Rejection API call with valid `X-Actor` header.

**What happens:** The job record is marked rejected with the actor name, timestamp, and rejection reason (if provided). The audit log records the full event.

**Recovery:** Manual only. If a lead was rejected and you change your mind, you must re-submit the lead or handle communication manually.

---

### `complete`

**Meaning:** The job has fully completed — the draft was sent, the DAW script ran, the file was delivered.

**Terminal state** — no transitions out.

**Triggered by:** Send worker or execution worker reporting success after performing the approved action.

**What's recorded:** Completion timestamp, actor (system), artifacts (message ID, delivery path, etc.).

---

### `failed`

**Meaning:** Something went wrong at any stage. The job cannot proceed.

**Terminal state** — no transitions out.

**Can be triggered by:**
- Module error during `in-progress` processing
- Worker error during `approved` execution
- Draft expiry (`MAX_DRAFT_AGE_HOURS` exceeded without decision)
- Unrecoverable system error

**What's recorded:** Failure timestamp, error message, retry count.

**Recovery:** Depends on the failure cause:
- Module processing error → re-submit the trigger (lead, email, stems)
- Worker execution error → investigate the error, re-submit for execution
- Draft expired → re-submit the original trigger; the content must be regenerated

---

## Tier Enforcement

Every job is tagged with a permission tier. OpenClaw enforces the tier before routing:

| Tier | Name | Policy | Examples |
|------|------|---------|---------|
| 1 | Read | Allowed to analyze and observe | Audio QC measurement, inbox reading |
| 2 | Draft | Allowed to write to queue, never send | Email drafts, session manifests |
| 3 | Queue | Must enter approval queue and wait for human | Lead replies, revision plans, delivery packages |
| 4 | Narrow Auto | Pre-approved bounded actions | File organization, folder creation |

**Tier escalation:** A module cannot self-escalate its tier. Only an explicit orchestration rule change (via admin API) can change a module's assigned tier.

---

## Actor Authentication

All mutating API requests require an `X-Actor` header identifying who is taking the action.

| Actor prefix | Who | Example |
|-------------|-----|---------|
| `human:` | Human operator | `human:owner`, `human:engineer` |
| `system:` | Internal service | `system:lead-intake`, `system:n8n` |
| `worker:` | Worker node | `worker:studio-mac` |

**Approval/rejection** requires a `human:` actor that matches `AUTHORIZED_ACTORS` in the environment config.

**Unauthenticated requests** — requests without `X-Actor` are rejected with HTTP 401. Requests with an actor not authorized for the specific action are rejected with HTTP 403.

---

## Audit Log

Every state transition is recorded in the append-only audit log.

Each entry contains:
- `actor` — who caused the transition
- `action` — what happened
- `job_id` — which job
- `tier` — permission tier of the action (1–4)
- `payload` — full context (previous state, new state, any draft content or script content)
- `timestamp` — when it happened

The audit log is **append-only** — entries are never modified or deleted. This is enforced at the database level (no UPDATE/DELETE permissions on the audit_log table for application users).

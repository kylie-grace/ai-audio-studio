# Safety Model — Why Approval-Gated

**Written for:** Developer Contributor, Self-Hosting Newcomer (trust-building)

---

## The Core Commitment

No outbound action happens without explicit human approval. Full stop.

This isn't a fallback or a safety feature bolted on after the fact — it's the architectural foundation. The entire system is designed so that the worst thing it can do without your approval is write a draft and put it in a queue.

This commitment holds for:
- Sending any email
- Executing any DAW operation
- Posting to social media
- Delivering files to a client
- Any action that touches money, relationships, or creative decisions

---

## Why This Design

The alternative — letting the system act autonomously on high-confidence outputs — fails in ways that are hard to recover from:

A wrong email to a client is a reputational event. A wrong DAW script on a client's session can destroy work. A wrong social post is a public statement. None of these can be taken back easily, and "the AI did it" is not a satisfying explanation to a client.

The value of the system is not in automating the final action — it's in doing 90% of the preparation so the human's job is fast, informed review rather than starting from scratch.

---

## The Permission Tier Model

Not all automation is equal risk. The system formalizes this with four tiers:

| Tier | Name | What it can do | Risk profile |
|------|------|----------------|-------------|
| 1 | Read | Analyze, observe, measure | Zero client-facing risk |
| 2 | Draft | Write to internal queue | Zero send risk |
| 3 | Queue | Request human approval | Gated — requires explicit yes |
| 4 | Narrow Auto | Pre-approved bounded actions | Bounded — no creative/financial decisions |

**Tier 1** actions (reading Gmail, measuring LUFS) carry no risk — the system is observing, not acting.

**Tier 2** actions (drafting an email, generating a mix plan) create something but don't send or execute it.

**Tier 3** actions require going through the approval queue. The job transitions to `awaiting-approval` and waits indefinitely. Nothing proceeds without a human decision.

**Tier 4** actions are pre-approved operations with clear boundaries — things like "organize these files into the correct folder structure" where the scope is completely defined and the worst outcome is a mislabeled folder, not a sent email.

Tier escalation requires an explicit orchestration rule change. A module cannot self-escalate.

---

## The FSM as Safety Mechanism

The job state machine (FSM) is not just a tracking tool — it's the enforcement layer.

The FSM ensures:
1. Jobs can only move forward through defined states
2. No job can reach `complete` without passing through `awaiting-approval` and `approved`
3. No job can skip states
4. No job can move backwards

The FSM is implemented in the `project-state` service, which is the single source of truth for all job states. No other service has write authority over job states — they report to project-state, they don't manage state themselves.

---

## Defense in Depth: The Double-Check

Even after a job reaches `approved` state, the system performs a second independent verification before taking any outbound action.

**The flow for email sending:**

1. Operator clicks Approve in the dashboard
2. API call: `POST /jobs/{id}/approve` with valid `X-Actor`
3. project-state transitions job to `approved` state
4. The approved-send worker polls for approved jobs
5. **The send worker independently queries project-state to verify the job is actually in `approved` state** — it does not trust a parameter passed to it
6. Only if project-state confirms `approved` does the send worker proceed
7. Email sends
8. Job transitions to `complete`

If step 5 fails (network error, state already changed, inconsistency), the send worker aborts. The email is not sent.

This means: a bug that corrupts the approval state in transit doesn't cause an email to send. Both the FSM state and the independent re-verification must agree.

---

## Separate Credentials by Capability

The inbox-triage service reads Gmail. The approved-send service sends email. These are different OAuth applications with different scopes:

- Inbox triage: `gmail.readonly` — can read, cannot write or send
- Approved send: `gmail.send` — can send, nothing else

Even if the inbox-triage service were compromised, an attacker could read emails but could not use those credentials to send. The send capability requires a completely different credential.

This principle extends to social media: having the content pipeline draft captions doesn't give it access to Instagram or Facebook credentials. Credentials are only given to the service that actually uses them, and only after human approval.

---

## The Actor System

Every mutating API request carries an `X-Actor` header identifying who is responsible for the action.

Actor types:
- `human:owner` / `human:engineer` — operator-level actors (can approve/reject)
- `system:{service}` — internal service actors (can create jobs, cannot approve)
- `worker:{slug}` — worker actors (can claim tasks, cannot approve)

Approval and rejection can only be performed by `human:` actors that appear in `AUTHORIZED_ACTORS`. A `system:` or `worker:` actor cannot approve jobs, regardless of any other authentication.

Requests without an `X-Actor` header are rejected with HTTP 401. Requests with an unauthorized actor for the specific action are rejected with HTTP 403.

All actors are recorded in the audit log with every action they take.

---

## The Audit Log

Every state transition, every approval, every rejection is permanently recorded.

Properties of the audit log:
- **Append-only** — entries can never be modified or deleted. Enforced at the database level (application user has no UPDATE or DELETE on audit_log).
- **Complete** — every job state transition creates an audit entry, not just approvals
- **Attributed** — every entry has an actor, timestamp, and full context
- **Queryable** — date-range filtering, job ID search, actor search

The audit log is the system's accountability layer. If there's ever a question about "did this get approved" or "who approved this" or "what changed between v1 and v2," the audit log has the answer.

---

## Dry-Run Default for DAW Execution

DAW execution is the highest-risk action in the system. Executed scripts change client audio. To prevent accidental execution:

- `STUDIO_WORKER_DRY_RUN_DAW=true` is the default
- In dry-run mode, the worker runs the full planning chain (session manifests, execution plans, mix plans) but does not dispatch to the DAW
- Plans are visible for review before enabling live execution
- Live execution requires explicitly setting `STUDIO_WORKER_DRY_RUN_DAW=false`

This mirrors the "enable live trading" pattern in financial systems: the simulation runs fully, you validate it looks right, then you flip the live switch.

---

## What the System Will Never Do Automatically

Regardless of configuration, these actions require human approval:

1. Send any email to any recipient
2. Execute any script in any DAW application
3. Post to any social media platform
4. Deliver any files to any external location
5. Make any financial transaction or commitment
6. Modify any client relationship records

No orchestration rule, no permission tier, no configuration option exists to bypass approval for these actions.

---

## Fail Closed

If the approval system is unavailable (project-state is down, database is unreachable), no jobs proceed. They do not default-approve, default-reject, or find an alternative path.

This is "fail closed" — the safe failure mode is doing nothing, not doing the wrong thing.

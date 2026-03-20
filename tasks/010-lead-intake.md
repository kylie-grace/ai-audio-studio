# Task 010 — Lead Intake Worker

## Purpose and Scope
Build the lead intake pipeline. Accepts raw input (form submission, email
text, or DM text), normalizes it into a structured lead record, scores fit
and urgency, generates a draft reply in Maggie's voice, writes to CRM, and
queues for human approval. **Must never send anything automatically.**

## Dependencies
- Task 001 complete: Docker Compose stack healthy
- Task 040 complete: Project state service running with `/approval-queue` endpoint
- Ollama serving PLANNER_MODEL and CLASSIFIER_MODEL
- CRM API running (stub from Task 001 is sufficient for bootstrap)

## Files to Create or Modify
- `workers/lead-intake/main.py` — FastAPI app, POST /webhook/lead-intake
- `workers/lead-intake/normalizer.py` — LLM-based field extraction
- `workers/lead-intake/scorer.py` — Deterministic fit + urgency scoring (no LLM)
- `workers/lead-intake/drafter.py` — LLM draft reply generation
- `workers/lead-intake/crm_client.py` — HTTP client for crm-api
- `workers/lead-intake/state_client.py` — HTTP client for project-state
- `workers/lead-intake/requirements.txt`
- `workers/lead-intake/Dockerfile`
- `services/openclaw-orchestrator/prompts/lead-intake-normalize.txt`
- `services/openclaw-orchestrator/prompts/lead-intake-draft.txt`
- `services/n8n/workflows/lead-intake-webhook.json`
- `infra/docker-compose.yml` — add lead-intake worker service

## Input Contract
```
POST /webhook/lead-intake
{
  "source": "form|dm|email",
  "raw_text": "...",
  "form_fields": {},        // optional structured data from form
  "received_at": "ISO-8601"
}
```

## Output Contract (all written to DB, returned in response)
```json
{
  "job_id": "uuid",
  "lead_id": "uuid",
  "project_id": "uuid",
  "normalized": {
    "artist_name": "",
    "service_requested": "mix|master|mix+master|session|other",
    "timeline": "",
    "budget_signal": "low|medium|high|unknown",
    "deliverables": [],
    "references": [],
    "urgency": "high|normal|low"
  },
  "fit_score": 75,
  "urgency_score": 60,
  "draft_reply": "...",
  "status": "awaiting-approval"
}
```

## Security Constraints
- **Tier 2 (Draft)**: Worker writes draft reply to `leads.draft_reply`. Does NOT send.
- **Tier 3 (Queue)**: Writes job to approval queue. Human must approve before any send.
- Worker has NO email send credentials in its environment.
- All LLM calls use local Ollama. No external API calls for content generation.
- `draft_sent = false` always on creation. Only the approved-send worker (separate service) can set this to true, and only after `draft_approved = true`.

## Scoring Logic (scorer.py — deterministic, no LLM)
```python
def score_fit(normalized: dict) -> int:
    score = 50  # baseline
    if normalized["service_requested"] in ("mix", "master", "mix+master"):
        score += 20
    if normalized["budget_signal"] in ("medium", "high"):
        score += 15
    if normalized["timeline"]:
        score += 10
    if normalized["references"]:
        score += 5
    return min(score, 100)
```

## Prompt Contract: lead-intake-draft.txt
```
You are writing a draft reply for Maggie, a professional mixing and mastering
engineer. Maggie's tone: warm, direct, professional. Not overly enthusiastic.

## Lead summary
Artist: {{artist_name}}
Service: {{service_requested}}
Timeline: {{timeline}}
Budget signal: {{budget_signal}}

## Instructions
Write a first-response email draft from Maggie:
1. Acknowledge by name
2. Confirm what service they want
3. Ask at most 2 missing critical questions
4. State Maggie's typical response timeline
5. NO pricing commitments. NO booking commitments.

Output ONLY the email body. No subject line. No meta-commentary.
3-4 short paragraphs.
```

## n8n Workflow: lead-intake-webhook.json
Trigger: Webhook POST to `/webhook/lead-intake`
Nodes:
1. Webhook trigger → normalize payload
2. HTTP Request → POST to `http://lead-intake:8130/webhook/lead-intake`
3. On error → write to error log, notify via internal alert
4. On success → no further action (job is in approval queue)

## Acceptance Tests
1. POST valid form payload → lead record in `leads` table with all normalized fields
2. `draft_reply` is non-empty, `draft_sent = false`, `draft_approved = false`
3. Job in `jobs` table with `status = awaiting-approval`
4. Job appears in `GET /approval-queue` on project-state
5. Approving via PUT `/approval-queue/{job_id}/approve` transitions status to `approved`
6. No email is ever sent by this worker under any condition
7. Malformed input returns HTTP 422 with structured error; no partial DB writes

## Definition of Done
Full lead arrives → classified → draft reply written in Maggie's voice →
CRM updated → appears in approval queue on Studio Brain UI.
Nothing sent. All audit log entries present with correct tier (2 or 3).

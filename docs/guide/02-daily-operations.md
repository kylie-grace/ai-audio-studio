# Daily Operations — Using the System Every Day

**Written for:** Studio Owner/Operator, Guest Engineer
**Prerequisite:** [First Run](01-first-run.md) complete, system running

---

## The Normal Day

The system runs in the background. Your interaction with it is concentrated into short bursts of review and approval. A typical day looks like this:

1. **Morning check** (5 minutes) — scan what needs attention
2. **Queue reviews** (scattered throughout the day) — approve or reject as items arrive
3. **Occasional monitoring** — check for alerts, ask the concierge if something seems wrong
4. **End of day** — nothing to do; the system keeps running

---

## Opening the Dashboard

The dashboard is always available at:
- **Local (same machine):** `http://localhost:3000`
- **LAN access:** `http://<control-plane-ip>:3000`
- **HTTPS (after cert trust):** `https://studio-brain.local` (or whatever you set as `CONTROL_PLANE_HOST`)

Bookmark the HTTPS URL once you've trusted the certificate. It's the cleanest access path.

---

## The Five Tabs at a Glance

| Tab | What you do there |
|-----|------------------|
| **Overview** | Morning check — what needs attention, assistant chat, service health |
| **Operations** | Approval queue, live alerts, worker management, audit log |
| **Settings** | Studio configuration, module tuning, integration status |
| **Context** | Project history, artifacts, QC reports, listening reviews |
| **Automation** | Workflow templates, orchestration rules, rule packs |

---

## Morning Check (5 Minutes)

### 1. Open the Overview Tab

The Overview tab is your dashboard's front page. Look at two things:

**"Needs Attention" section** — Any item here is blocking progress. This includes:
- Pending approvals (items waiting for your yes/no)
- Active alerts (things the system wants you to know about)
- Build gaps (integrations or settings that aren't configured yet)

**Service health summary** — Four zones: Control Plane, AI Runtime, Automation Modules, Production Services. All should be green. If something is yellow or red, check the Operations tab.

### 2. Ask the Control Room Assistant

The concierge chat (bottom-left area of the Overview tab) is backed by your local LLM and has live context about your stack. Good morning questions:

> "What needs my attention right now?"

> "Is anything failing or degraded?"

> "How many approvals are pending?"

The assistant knows about your current approval queue, worker health, alerts, and configuration state. It won't make things up — if it doesn't have context, it says so.

### 3. Check Approval Count

If approvals are pending, click over to **Operations** to work the queue.

---

## Working the Approval Queue

The Approval Queue is in the **Operations** tab. Items are organized by type:

- **Lead Drafts** — new lead inquiries with drafted replies
- **Inbox Drafts** — client email replies
- **Social Content** — platform-specific captions
- **Session Plans** — session prep approvals
- **Execution Plans** — DAW operation approvals (if DAW profile enabled)
- **Delivery Packages** — QC-gated delivery bundles

### Reading an Approval Card

Each card shows you:
- **What triggered it** — the source (form submission, email thread, stems upload)
- **What the system found** — extracted details, classification, analysis results
- **What the system wants to do** — the draft text, the plan, the file list
- **Confidence indicators** — how certain the system is about its analysis

### Making a Decision

**Approve** — The action proceeds. For email/social, it goes to the send queue. For DAW operations, the worker executes. For session prep, files are organized.

**Edit then approve** — Click into the draft text or plan details, modify what you want, then approve. Your edits are recorded in the audit log.

**Reject** — The action is cancelled. The item is logged with your rejection and never proceeds. If it was urgent (a lead, a revision deadline), the system may surface an alert.

### How Long Items Wait

Drafts expire after 48 hours by default (configurable with `MAX_DRAFT_AGE_HOURS`). Expiry means the draft is removed from the queue — it does NOT mean anything was sent. Expired drafts are logged.

---

## Monitoring Live Alerts

The **Live Alerts** section in the Operations tab surfaces runtime escalations. Alert types include:

- **Worker offline** — the studio worker (if configured) has stopped heartbeating
- **Queue backed up** — approval items have been waiting longer than expected
- **LLM unavailable** — Ollama is unreachable (drafts still queue but won't have AI content)
- **QC failure** — a render failed quality checks
- **Draft expired** — a high-urgency lead or revision draft expired without review
- **Integration error** — a Gmail or social API call failed

Each alert shows a severity level and suggested action. For worker and LLM alerts, the Operations tab also shows safe action buttons (drain worker, navigate to settings).

If you've configured a webhook URL or alert email in Settings, critical alerts are pushed there too.

---

## Reviewing Project History

The **Context** tab is your project archive.

Select a project from the selector. You'll see its full artifact history:

- **Session manifests** — what was organized, which stems, any validation issues
- **QC reports** — all measurement passes and failures for this project
- **Mix plans** — the generated mix decisions that were approved
- **Revisions** — client revision notes and the parsed execution plans
- **Renders** — render artifacts with listening report data
- **Delivery history** — completed delivery packages with download links

Use this tab when a client asks "what happened to my files" or "what did the last revision change."

---

## Asking the Concierge

The Control Room Assistant in the Overview tab is useful for more than a morning check. Good questions for throughout the day:

**Status queries:**
- "How many items are in the approval queue?"
- "Is the worker healthy?"
- "When was the last lead that came in?"

**Setup and troubleshooting:**
- "How do I set up Gmail?"
- "Why is inbox triage disabled?"
- "What does the LUFS number on this QC report mean?"

**Guidance:**
- "Walk me through approving a session prep"
- "What should I check if my audio QC is always failing?"
- "How do I update my engineer voice?"

The concierge will tell you if it's running on Ollama or in fallback mode. In fallback mode (if Ollama is unavailable), it provides static guidance rather than context-aware answers.

---

## Worker Management

If you have a studio worker configured (either local or remote on a second Mac), the **Operations** tab has a Worker Runtime Control section.

**Normal operations:**
- Worker should show as **healthy** with a recent heartbeat timestamp
- Current task queue depth shows pending work

**Maintenance operations:**
- **Drain** — stop accepting new tasks, let current tasks finish. Use before updating the worker, restarting a DAW, or doing maintenance on the studio Mac.
- **Resume** — start accepting tasks again after drain/maintenance.
- **Retire** — permanently remove the worker registration (use when decommissioning).

Never stop a worker mid-task (it will leave the task stuck). Always drain first.

---

## End of Day

Nothing to do. The system keeps running.

If you're shutting down the control plane machine (the Mac with Docker):
```bash
docker compose --env-file infra/.env -f infra/docker-compose.yml down
```

When you restart, bring it back up with the same command you used to start it. All state is persisted in the database.

---

## The Audit Log

Everything the system does is permanently recorded. The audit log is in the **Operations** tab, scrollable with date-range filtering.

The log records:
- Every job state transition (pending → in-progress → awaiting-approval → approved/rejected)
- Every approval or rejection, with the actor name and timestamp
- Every automation action taken
- Every alert triggered

The audit log is append-only — nothing in it can be modified. If you need to verify what happened to a project, the audit log has the complete history.

---

## Quick Reference: Common Tasks

| What you want to do | Where to go |
|--------------------|-------------|
| See pending approvals | Operations → Approval Queue |
| Check service health | Overview → Service Zone summaries |
| Ask a question | Overview → Control Room Assistant |
| Find a past delivery | Context → select project → Delivery History |
| Check a QC report | Context → select project → QC Reports |
| Pause the worker | Operations → Worker Runtime → Drain |
| Change your engineer voice | Settings → Edit Setup → Identity |
| Enable/disable a module | Settings → Module Settings |
| See alert history | Operations → Live Alerts |
| Check the audit log | Operations → Audit Log |

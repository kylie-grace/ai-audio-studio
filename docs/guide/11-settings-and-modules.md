# Settings and Module Configuration

**Written for:** Studio Owner/Operator

---

## Overview

All settings live in two places:

1. **The Settings tab** in the dashboard — operator-facing, persisted to the database
2. **`infra/.env`** — low-level configuration, requires stack restart to take effect

For day-to-day operation, use the Settings tab. For infrastructure changes (ports, tokens, LLM provider, paths), edit `.env` and restart.

---

## The Setup Questionnaire

Located at: Settings → Edit Setup

This is the first-run questionnaire that persists your studio's configuration. You can re-open and edit it at any time.

### Identity Section

**Studio Name** — Your studio's name. Appears in generated documents, session notes, and delivery packages.

**Engineer Name** — Your name. Used in the audit log for every approval you make. "Approved by [Engineer Name]" is the record.

**Engineer Voice** — The most important setting for communication quality. 1–3 sentences describing your style:

| Quality | Example |
|---------|---------|
| Good | "Warm and direct. I write to the person, not the service. I'm honest about timelines, specific about logistics, and always acknowledge the creative work that came in." |
| Too vague | "Professional." |
| Too long | Multiple paragraphs — only the first 1–2 sentences meaningfully influence drafts |

Test this setting by submitting a test lead and reading the draft reply. If it doesn't sound like you, revise.

### Shared Paths Section

These paths must be reachable by the services that use them.

| Field | Used by | Notes |
|-------|---------|-------|
| Projects Path | Session prep, mix planner, delivery packager | Where project folders are created |
| Deliveries Path | Delivery packager | Where finished delivery bundles go |
| Draft Queue Path | Internal staging | Managed by the system |
| Approval Queue Path | Internal staging | Managed by the system |
| Incoming Stems Path | Session prep (watched folder) | Drop stems here to trigger session prep |

On a single machine: use absolute local paths.
In split mode: these must be shared volume paths reachable by both machines (or use `PATH_TRANSLATION_JSON`).

### Alert Configuration

| Field | What it does |
|-------|-------------|
| Alert Webhook URL | Receives POST requests when runtime alerts fire. Supports Slack, Discord, Make.com, any generic webhook. |
| Alert Email | Email address for critical escalations. Leave blank if using webhook only. |
| Alert Types | Which types of alerts trigger external notifications (dropdown in the Settings form) |

Dashboard alerts are always on regardless of this configuration. This setting controls whether alerts also go external.

### Deployment Mode

The form captures which deployment mode you're running:

- **single_machine** — one Mac does everything. Default. No worker configuration needed.
- **control_plane_plus_worker** — control plane on one machine, worker on another.

For split mode, you'll also configure:
- Worker slug and display name
- Worker API URL (the LAN URL where the worker is reachable)
- Worker capabilities

---

## Module Settings

Located at: Settings → Module Settings

Each automation module can be individually enabled or disabled. Disabling a module makes it return HTTP 423 (Service Unavailable — disabled by operator) to any incoming requests.

### Toggling Modules

| Module | When to disable |
|--------|----------------|
| Lead Intake | If you're not taking new clients for a period |
| Inbox Triage | If you want to handle all email manually (maintenance, vacation) |
| Content Pipeline | If you're not doing social content right now |
| Session Prep | If you're handling stems manually for a specific project |
| Audio QC | Rarely — QC is a gate for delivery; disabling it means delivery packages won't have QC verification |
| Revision Parser | If you prefer to handle revisions manually |
| Mix Planner | If you don't want AI-assisted mix planning |
| Delivery Packager | If you're doing manual delivery for a specific project |

> ⚠️ **Disabling Audio QC doesn't bypass the delivery gate.** If QC is disabled and a render hasn't been QC'd, delivery packaging still can't proceed. To bypass the gate entirely requires manual intervention.

### Per-Module Tuning

Each enabled module has additional tuning parameters accessible in the Module Settings panel:

**Lead Intake:**
- Minimum fit score to queue a draft (0–100, default 0 — all leads queue)
- Response SLA target (hours before the system surfaces an escalation)

**Inbox Triage:**
- Which labels to watch (`ALLOWED_INBOX_LABELS` via env, also settable in the module config)
- Classification confidence threshold (below this, the system flags for manual review)

**Content Pipeline:**
- Default platforms to generate for
- Hashtag pool size per platform

**Session Prep:**
- Validation strictness (which issues are errors vs. warnings)
- Default effort level for new sessions

**Audio QC:**
- LUFS target range (min/max)
- True peak ceiling (default -1.0 dBTP)
- Phase correlation minimum
- Default effort level for new QC runs

**Revision Parser:**
- Confidence threshold (below this, items are flagged as low-confidence in the execution plan)
- Max changes per execution plan (safety limit)

---

## Style Profiles

Located at: Settings → Style Profiles (also accessible from Context tab per project)

Style profiles are the aesthetic guidance layer for mix planning, revision parsing, and content generation.

### Creating a Studio Profile

A studio profile applies to all projects by default. Click "Create Studio Profile" and either:

1. **Paste text** — Write or paste a description of your production aesthetic, typical references, approach, and preferences.

2. **Reference files** — Link to existing documents (mix notes, mood boards, reference track lists) on your shared storage.

3. **Combined** — Text description plus file references. The system reads both.

**What to include in your profile:**

- Your general approach to mixing/mastering (dense vs. sparse, warm vs. bright)
- Typical reference artists you work toward
- Specific aesthetic decisions you make consistently (e.g., "I always compress the overhead bus heavily", "vocals always sit forward of everything")
- What you avoid (e.g., "I never use stereo-widening on bass frequencies")
- Service-specific guidance if you do multiple services (mixing notes vs. mastering notes)

**Good example:**

> *My mixes lean warm and present. I mix to the vocal — everything else is in service of the story the singer is telling. I reference Big Thief and Phoebe Bridgers for folk/indie projects. For production work, I value space and dynamics; if the room isn't breathing, the mix isn't done. I avoid harsh high-frequency energy and never compete with the kick's low end using bass guitars. I use parallel compression on drums in 90% of sessions. My mastering targets -14 LUFS for streaming delivery with a -1.0 dBTP ceiling.*

### Project-Level Profiles

For a project with a distinct aesthetic different from your studio defaults, create a project-level profile:

Context tab → select project → Style Profile → Create/Edit

Project profiles override the studio profile for that project only.

### Updating Profiles

Edit profiles at any time. Changes take effect on the next job that reads the profile. Existing approved plans are not retroactively changed.

---

## Connection Center

Located at: Settings → Connection Center

The Connection Center shows the status of every external integration:

| Integration | Status indicators | Next steps shown |
|-------------|------------------|-----------------|
| Front Door (HTTPS) | URL, TLS status | Certificate trust instructions |
| n8n Workflows | Bootstrap status, active workflow count | Run bootstrap command if not done |
| Gmail Intake | Credential presence, label configured | OAuth setup link |
| Gmail Send | Credential presence, send test result | OAuth setup link |
| Instagram | Token presence, API test | Token setup link |
| Facebook | Token + Page ID presence, API test | Token setup link |
| Worker Runtime | Worker slug, health, last heartbeat | Worker setup instructions |

Click any card for detailed status and step-by-step next actions for that specific integration.

---

## Workspace Settings Persistence

All settings entered through the questionnaire and module settings are persisted in the database. This means:

- Settings survive Docker restarts
- Settings are part of your backup if you back up the Postgres data volume
- Settings are not in your `.env` file — they live in the database

**What is in the database:** Studio identity, paths, voices, module settings, style profiles, alert configuration, worker settings.

**What is in `.env`:** Passwords, API tokens, host-level network configuration, LLM provider selection, and paths that must be set before the stack starts (before the database is available).

---

## Backing Up Settings

To export your workspace settings:
```bash
docker compose exec crm-api curl -s http://localhost:8090/workspace-settings
```

This returns the full JSON representation of your settings. Store it somewhere safe.

To back up the entire database (including all settings, jobs, audit log):
```bash
docker compose exec postgres \
  pg_dump -U studio studiodb > backup-$(date +%Y%m%d).sql
```

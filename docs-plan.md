# AI Audio Studio — Documentation Master Plan
**Prepared:** 2026-03-22
**Authors:** Senior Technical Writer + Senior Engineer collaboration
**Status:** Approved for execution

---

## Overview

The current README is a technical orientation document, not a user manual. What has been built is a complete studio operations platform spanning 15+ microservices, 3 DAW adapters, an approval-gated FSM, LLM concierge, n8n automation layer, two deployment topologies, and a 5-tab operator dashboard. A new user — or even the owner — cannot form a working mental model from the existing docs alone.

This plan produces a **complete documentation suite** organized into four layers:
1. **User Manual** — how to operate the platform day-to-day
2. **Setup & Installation** — how to get from zero to running
3. **Reference** — what every piece does, every config var, every endpoint
4. **Architecture & Decisions** — why it's built this way (already partially exists)

Total documents to produce: **21 new/expanded files**
Total estimated reading time when complete: ~4 hours for full suite; ~20 min for onboarding path

---

## Audience Profiles

| Persona | Who | Needs |
|---------|-----|-------|
| **Studio Owner/Operator** | You (Kylie-Grace) | Daily operations, setup, customization |
| **Guest Engineer** | A collaborator given access | What to do, what not to touch |
| **Self-Hosting Newcomer** | Someone who found the public repo | How to deploy and why |
| **Developer Contributor** | PR author, fork builder | Architecture, conventions, contribution |

Every document must identify which persona(s) it targets.

---

## Documentation Architecture

```
docs/
├── README.md                          (repo root — project gateway, already exists, needs expansion)
│
├── guide/                             (USER MANUAL — operator-facing)
│   ├── 00-overview.md                 (What this does and why — the pitch and mental model)
│   ├── 01-first-run.md                (Setup questionnaire, first-time walkthrough)
│   ├── 02-daily-operations.md         (The normal day: morning check, approval queue, alerts)
│   ├── 03-approval-workflow.md        (Deep dive: every approval type, what to look for)
│   ├── 04-leads-and-inbox.md          (Lead intake + email triage user flow)
│   ├── 05-session-and-daw.md          (Session prep, mix planning, DAW execution)
│   ├── 06-audio-qc.md                 (What QC measures, how to read reports, thresholds)
│   ├── 07-revisions.md                (Client revision flow end-to-end)
│   ├── 08-delivery.md                 (QC-gated delivery packaging and handoff)
│   ├── 09-social-content.md           (Brief → captions → approval → publish)
│   ├── 10-concierge.md                (Control Room Assistant — what to ask, how it helps)
│   ├── 11-settings-and-modules.md     (All settings, module enable/disable, tone/voice)
│   ├── 12-integrations.md             (Gmail, Instagram, Facebook — step-by-step OAuth)
│   └── 13-troubleshooting.md          (Common failures, what they mean, how to fix)
│
├── setup/                             (INSTALLATION — get to running)
│   ├── 01-quick-start.md              (One machine, 20 minutes, working stack)
│   ├── 02-split-mode.md               (Mac mini + Mac Pro configuration)
│   ├── 03-environment-variables.md    (Every env var, grouped, annotated)
│   ├── 04-ollama.md                   (Native LLM setup, model pulls, commercial fallback)
│   ├── 05-https-and-lan.md            (Caddy TLS, LAN access, certificate trust)
│   └── 06-worker-setup.md             (Remote worker on Mac Pro — full walkthrough)
│
├── reference/                         (REFERENCE — lookup tables and specs)
│   ├── service-map.md                 (All services: port, purpose, dependencies, endpoints)
│   ├── api-reference.md               (Key endpoints operators actually call or link to)
│   ├── database-schema.md             (All tables, relationships, what they hold)
│   ├── fsm-states.md                  (Job FSM — all states, transitions, what triggers each)
│   └── n8n-workflows.md               (8 starter workflows — what each does, webhook URLs)
│
└── architecture/                      (DESIGN — already partially exists, expand)
    ├── ADR-001-openclaw-scope.md       (exists)
    ├── ADR-002-approval-policy.md      (exists)
    ├── ADR-003-model-selection.md      (exists)
    ├── two-machine-design.md           (architecture narrative + diagrams in text)
    └── safety-model.md                (why approval-gated, tiers, fail-closed philosophy)
```

---

## Document-by-Document Specifications

---

### ROOT: README.md (EXPAND — highest priority)

**Current state:** Technical orientation, quick start, service map
**Target state:** Complete gateway document — sells the system, orients new users, routes to docs

**Sections to add/expand:**
1. **What AI Audio Studio Does** — 3-paragraph plain-English narrative (not bullet lists)
   - "This platform replaces the administrative layer of studio operations..."
   - Studio context: two-machine setup, what each machine does
   - What you approve, what runs automatically, what never runs without you

2. **Who This Is For** — Studio owner, solo engineer, small team, what you need before starting

3. **How It Fits Your Workflow** — Describe a full lead-to-delivery journey in prose
   - Lead comes in → system drafts reply → you approve
   - Stems arrive → system organizes → you approve session prep
   - Revisions come back → system parses → you approve execution plan
   - Render passes QC → system packages → you approve delivery

4. **What Requires Human Approval (Always)** — The safety commitment in plain English

5. **The Control Room (Dashboard Overview)** — 5 tabs, what each does in 2 sentences

6. **Quick Start** (IMPROVE — current version is too terse)
   - Numbered steps with expected output at each step
   - What "healthy" looks like
   - First place to go when running

7. **Documentation Map** — Table routing each persona to their starting point

8. **Requirements** — Hardware (16GB minimum, Apple Silicon recommended), software, network

---

### guide/00-overview.md

**Persona:** All
**Purpose:** Mental model before any setup — what this system is, how to think about it

**Sections:**
1. **The Problem This Solves** — Studio admin overhead: lead triage, client emails, session logistics, revision management, delivery packaging. Quantify: "typically 4-8 hours per week of non-creative work"
2. **What the System Handles Automatically** — List of automated actions (analysis, drafting, organizing, measuring)
3. **What Always Requires Your Approval** — List of gated actions (sending emails, executing DAW scripts, posting social, delivering files)
4. **The Two Machines** — Control Plane (always-on, runs the brain) vs. Studio Mac (your DAW workstation). Diagram in ASCII art showing data flow.
5. **The Five Modules** (high level, no technical detail)
   - Client Communication (Lead intake + inbox triage)
   - Content (Social drafting)
   - Session Work (Session prep + DAW execution)
   - Quality Control (Audio analysis)
   - Delivery (QC-gated packaging)
6. **The Permission Tier Model** — Read → Draft → Queue → Narrow Auto. Plain English, with examples.
7. **Where Your Data Lives** — All on-premises, no cloud calls except optional LLM API fallback
8. **A Day in the Life** — Narrative walkthrough of a full studio day

---

### guide/01-first-run.md

**Persona:** Studio Owner/Operator, Self-Hosting Newcomer
**Purpose:** From zero to first approval — complete onboarding experience

**Sections:**
1. **Before You Start** — Checklist: Docker installed, 20GB disk free, port 3000 available, Ollama download started
2. **Step 1: Configure Your Environment** — Walking through `infra/.env` line by line for the essential fields. Mark optional vs. required clearly.
3. **Step 2: Start the LLM Engine** — `bash scripts/start-ollama.sh` — what it downloads, how long it takes, how to verify
4. **Step 3: Start the Stack** — `docker compose up -d`, watch for healthy status, common failures at this step
5. **Step 4: Import Starter Workflows** — `bash scripts/bootstrap_n8n.sh` — what it does, what "idempotent" means, how to verify
6. **Step 5: Open the Dashboard** — What you see, what each zone means
7. **Step 6: The Setup Questionnaire** — Walk through every field in the Settings questionnaire
   - Studio Name and Engineer Name
   - Shared Paths (where your audio files live)
   - Engineer Voice (how the system communicates on your behalf — examples of good vs. bad voice settings)
   - Alerts (where to receive escalations)
   - Worker Configuration (single machine vs. split mode)
8. **Step 7: Test the Approval Flow** — Submit a test lead, watch it appear in the queue, approve it
9. **You're Ready** — What to do next (link to daily operations)

---

### guide/02-daily-operations.md

**Persona:** Studio Owner/Operator, Guest Engineer
**Purpose:** The normal workday — what to check, what to do, in what order

**Sections:**
1. **Morning Check (5 minutes)** — Exact sequence
   - Open dashboard → Overview tab
   - Check the "needs attention" section
   - Scan live alerts
   - Ask the Control Room Assistant for status summary
2. **Working the Approval Queue** — Operations tab, tabbed by type
   - How to read each approval card
   - Edit before approving (voice, content, script changes)
   - When to reject vs. edit and approve
   - What rejection does (queues feedback, escalates if urgent)
3. **Monitoring Live Alerts** — What each alert type means, priority indicators, safe actions
4. **Context Tab: Reviewing Project History** — Finding past artifacts, downloading deliveries, viewing QC reports
5. **When Work Slows Down** — Concierge for status ("any issues?"), checking audit log, validation
6. **End of Day** — No formal shutdown required; system is always-on. What persists across restarts.
7. **Emergency: Draining the Worker** — When and how to pause DAW execution (Operations tab)

---

### guide/03-approval-workflow.md

**Persona:** Studio Owner/Operator
**Purpose:** Complete reference for everything that lands in the approval queue

**Sections:**
1. **Why Everything Goes Through Approval** — The philosophy (your voice, your decisions)
2. **Approval Queue Tabs** — Each type gets a subsection:
   - **Lead Replies** — What the system extracted from the lead, confidence signals, the draft reply, tone indicators
   - **Email Replies** — Classification shown, urgency indicated, the draft, what thread it belongs to
   - **Social Captions** — Platform indicators, character count, hashtag pool, asset manifest, one-click per-platform approval
   - **Revision Execution Plans** — The parsed changes, confidence flags, what will execute in the DAW, what can't be parsed
   - **Session Prep Plans** — Stem count, validation issues found, what the manifest contains, paths it will write
   - **Delivery Packages** — QC scores shown, file list, client-facing structure preview
3. **Editing Before Approving** — What is editable, what is locked, how edits are tracked
4. **The Safety Guarantee** — What happens if you close the browser mid-approval, what happens if two people approve simultaneously
5. **Bulk Operations** — Approving multiple items at once (when safe)
6. **The Audit Trail** — Every approval is logged with actor + timestamp. Where to find it.

---

### guide/04-leads-and-inbox.md

**Persona:** Studio Owner/Operator
**Purpose:** Complete guide to client communication automation

**Sections:**
1. **How Leads Arrive** — Form submissions, DMs, emails — what triggers each flow
2. **What Lead Intake Does** — Normalization, scoring, voice-matched draft generation
   - The 0-100 fit score (what factors)
   - The urgency score (what factors)
   - What the system does with low-fit leads (still queues for your decision)
3. **The Lead Approval Card** — Anatomy: source, extracted data, fit/urgency scores, the draft reply
4. **Customizing Your Voice** — How the engineer voice setting affects drafts, examples
5. **After Approval** — What the approved-send worker does, when it sends, confirmation
6. **Inbox Triage** — Setting up the Gmail label ("NeedsReply"), what happens to emails
   - Classification types: payment, revision-request, scheduling, lead, noise, admin
   - What "noise" classification means (surfaced but no draft generated)
   - What "admin" means vs. "lead" in inbox context
7. **Inbox Approval Card** — Classification shown, urgency indicator, the draft
8. **Setting Up Gmail** (pointer to guide/12-integrations.md)

---

### guide/05-session-and-daw.md

**Persona:** Studio Owner/Operator (DAW-enabled setups)
**Purpose:** How DAW automation actually works — from stems to session

**Sections:**
1. **Prerequisites** — DAW profile enabled (`--profile daw`), worker running, shared paths configured
2. **How Stems Arrive** — Watched path, n8n trigger, or manual operator submission
3. **Session Prep in Detail**
   - What the validator checks: sample rate, bit depth, duration, format, channel count, naming
   - The session manifest (what it is, how to read it)
   - Issues: what flagged issues mean, when to fix vs. approve-anyway
   - The session template: what gets created, where files go
4. **Approving Session Prep** — What you're reviewing in the approval card, what "approve" commits
5. **Mix Planning**
   - How the mix planner reads the manifest + your style profile
   - The mix plan: reading levels, EQ chains, FX routing, reference comparison points
   - Approving the mix plan: what changes when you approve
6. **Execution Plans** — Combined: session manifest + mix plan + render plan + listening plan
   - Dry-run mode: what it shows before committing
   - Reading execution confidence scores
   - What partial execution looks like
7. **Live DAW Execution** — Setting `STUDIO_WORKER_DRY_RUN_DAW=false`, understanding the risk
8. **The Style Profile** — What it is, how to set it, how it affects mix decisions
   - Studio-level vs. project-level profiles
   - Pasting text vs. referencing existing files
   - Examples of good style profile content

---

### guide/06-audio-qc.md

**Persona:** Studio Owner/Operator, Guest Engineer
**Purpose:** Understanding what QC measures and how to act on reports

**Sections:**
1. **What Audio QC Measures** — Explanation of each metric in plain English for engineers
   - **LUFS Integrated** — Streaming platform targets (-14 LUFS typical), what too loud/quiet means
   - **True Peak dBFS** — Why -1.0 dBTP is the universal ceiling, intersample peaks
   - **Clipping Detection** — Sample-level vs. perceived clipping, what the flag means
   - **Phase Coherence** — Stereo correlation, mono compatibility, why it matters for radio/club play
   - **Spectral Tilt** — The energy balance metric, what "too bright" or "too dark" means in this context
   - **Low-End Energy Ratio** — Sub/bass proportion, platform-specific expectations
2. **Effort Levels** — What levels 1-4 mean in terms of strictness and what each checks
3. **Reading a QC Report** — Anatomy of the JSON report, pass/fail indicators, issue descriptions
4. **Comparative QC** — Running candidate vs. reference, how to interpret the diff
5. **What Fails QC** — The 6 conditions that trigger a fail, and what action each implies
6. **After a QC Fail** — Where it goes in the queue, who sees it, recommended next steps
7. **After a QC Pass** — Automatic routing to delivery packager, or back to listening review

---

### guide/07-revisions.md

**Persona:** Studio Owner/Operator
**Purpose:** Client revision flow from receipt to execution

**Sections:**
1. **How Revision Notes Arrive** — Email, n8n webhook, manual paste
2. **What the Revision Parser Does** — LLM parsing → structured change objects, confidence scoring
   - Change object anatomy: location, action, parameter, confidence
   - High vs. low confidence — when to review more carefully
   - Unparseable notes — what happens (flagged, surfaced for manual translation)
3. **The Revision Execution Plan Card** — What each parsed change means
   - Reaper changes (ReaScript)
   - Pro Tools + SoundFlow changes
   - WaveLab changes (mastering)
4. **Editing the Execution Plan** — Adding context, overriding parsed values, marking skipped changes
5. **Approving Execution** — What commits when you approve, what the worker does
6. **After Execution** — Listening report, QC run, next-action recommendations
7. **Common Revision Patterns** — Table: "client says X → system generates Y → means Z"

---

### guide/08-delivery.md

**Persona:** Studio Owner/Operator
**Purpose:** QC-gated delivery from passed render to client package

**Sections:**
1. **The Delivery Gate** — QC must pass before delivery can be assembled; this is not overridable
2. **What the Delivery Packager Creates** — Folder structure, naming convention, metadata embedding, documentation
3. **The Delivery Approval Card** — File list, QC scores attached, client-facing folder preview
4. **Customizing Delivery Structure** — Folder naming, file inclusion rules
5. **Download Links** — Where they appear (Context tab → project), how long they persist
6. **Delivery History** — Finding past deliveries, re-downloading, audit log of delivery events

---

### guide/09-social-content.md

**Persona:** Studio Owner/Operator
**Purpose:** Social content drafting from brief to posting

**Sections:**
1. **How Content Briefs Arrive** — n8n webhook, manual submission to content-pipeline
2. **What the Content Pipeline Does** — Platform-specific caption generation with studio voice
   - Character limits per platform (Instagram: 2200, Facebook: uncapped, Threads: 500, LinkedIn: 3000)
   - Hashtag pool generation (deterministic, style-matched)
3. **Reading the Content Approval Card** — Per-platform tabs, character count indicator, hashtag review
4. **Asset Manifest** — Attaching images/video to posts (what the manifest field expects)
5. **Approving Social Content** — Per-platform approval, how to approve Instagram but hold Facebook
6. **After Approval** — Posting workflow (requires Instagram/Facebook tokens), where to configure
7. **Setting Up Social Publishing** (pointer to guide/12-integrations.md)

---

### guide/10-concierge.md

**Persona:** Studio Owner/Operator, Guest Engineer
**Purpose:** How to use the Control Room Assistant effectively

**Sections:**
1. **What the Control Room Assistant Is** — Local LLM with live stack context, not a general chatbot
2. **What It Knows** — Live workspace settings, approval queue status, worker health, alerts, rules, projects
3. **What It Can Do** — Safe actions it can initiate on your behalf (drain worker, navigate to settings, run smoke test)
4. **What It Cannot Do** — Send emails, approve items, modify settings, execute DAW actions (must be human-approved)
5. **Good Questions to Ask**
   - "What needs my attention right now?"
   - "Why is the worker showing offline?"
   - "What's blocking the current session prep?"
   - "Walk me through setting up Gmail"
   - "What do the LUFS numbers on this QC report mean?"
   - "How do I add a custom orchestration rule?"
6. **LLM Provider Status** — "Using Ollama" vs. "Fallback guidance mode" — what each means
7. **When the Concierge Is Wrong** — It's honest about uncertainty, but verify critical decisions in the audit log
8. **Fallback Mode** — What happens when Ollama is unavailable (static guidance, known-state answers)

---

### guide/11-settings-and-modules.md

**Persona:** Studio Owner/Operator
**Purpose:** Complete settings reference and module customization guide

**Sections:**
1. **The Setup Questionnaire (First Run / Edit Anytime)** — Every field explained
   - Studio Name, Engineer Name, Engineer Voice (examples)
   - Shared Paths — projects, deliveries, draft queue, approval queue, incoming stems
   - Alert Configuration — webhook URL, email, which alert types to receive
   - Worker Settings — single vs. split, remote worker URL, capabilities
2. **Module Enable/Disable** — What happens when a module is disabled (HTTP 423, graceful queue drain)
   - Lead Intake toggle
   - Inbox Triage toggle
   - Content Pipeline toggle
   - Session Prep toggle
   - Audio QC toggle
   - Revision Parser toggle
   - Mix Planner toggle
   - Delivery Packager toggle
   - Studio Worker toggle
3. **Per-Module Configuration** — The settings available for each module (thresholds, labels, effort levels)
4. **Style Profiles** — Creating, editing, scope (studio vs. project), how they affect outputs
5. **Workspace Settings Persistence** — What persists, what resets on restart, how to back up settings

---

### guide/12-integrations.md

**Persona:** Studio Owner/Operator
**Purpose:** Complete step-by-step for every external integration

**Sections:**
1. **Gmail (Read-Only: Inbox Triage)**
   - Google Cloud project setup
   - Gmail API enable
   - OAuth consent screen (External, scope: gmail.readonly)
   - OAuth 2.0 Client ID creation
   - Redirect URI: `http://localhost:5678/rest/oauth2-credential/callback`
   - Getting refresh token
   - Adding to `.env`: GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN
   - Setting up the Gmail label "NeedsReply" in your inbox
   - Verify: first triage run
   - Troubleshooting: token expiry, scope errors

2. **Gmail (Send: Approved Drafts)**
   - Why this is a separate OAuth app (different scope, different credential)
   - Same flow as above but with gmail.send scope
   - GMAIL_SEND_* env vars
   - Verify: approve an inbox draft, confirm it sends

3. **Instagram Publishing**
   - Meta Developer app prerequisites
   - Instagram Business account requirement
   - Access token generation
   - INSTAGRAM_ACCESS_TOKEN env var
   - Rate limits and platform restrictions
   - Verify: approve a social caption, confirm it posts

4. **Facebook Publishing**
   - Facebook Page requirement
   - Page Access Token (not user token — important distinction)
   - FACEBOOK_PAGE_ID, FACEBOOK_ACCESS_TOKEN env vars
   - Verify: approve a Facebook caption, confirm it posts

5. **External Alert Webhook**
   - ALERT_WEBHOOK_URL — any POST endpoint (Slack, Discord, Make.com, Zapier)
   - Payload shape: what gets sent
   - Which alert types trigger it

6. **n8n Webhooks (Inbound)**
   - Where webhook URLs are found after bootstrap
   - URL pattern: `https://{N8N_WEBHOOK_URL}/webhook/{workflow-id}`
   - Connecting lead forms, email services, external triggers

---

### guide/13-troubleshooting.md

**Persona:** All
**Purpose:** Common failures — what they mean, how to fix them

**Sections organized as: Symptom → Cause → Fix**

1. **Services won't start / unhealthy**
   - Postgres not ready: wait longer; run `docker compose logs db`
   - Port conflict: another service using 3000/5678/8080
   - Volume permissions: chown the data directory

2. **Ollama not available**
   - LLM timeout: check `ps aux | grep ollama`, restart with `bash scripts/start-ollama.sh`
   - Model not pulled: re-run start script, check disk space
   - Memory pressure: 16GB minimum; close other apps; reduce OLLAMA_MAX_LOADED_MODELS

3. **Approvals not appearing**
   - n8n not running: check `docker compose ps n8n`
   - Webhook URL mismatch: N8N_WEBHOOK_URL doesn't match actual n8n host
   - Module disabled: check Settings → Module Settings
   - Lead score too low: check fit_score_minimum setting

4. **Worker offline**
   - Worker not running: `docker compose ps studio-worker` or check launchd on Mac Pro
   - Network not reachable: WORKER_API_BASE_URL wrong or firewall blocking
   - Token mismatch: WORKER_API_TOKEN doesn't match between control plane and worker

5. **Gmail not reading / sending**
   - OAuth token expired: regenerate refresh token (tokens last ~6 months)
   - Label "NeedsReply" not found: create label in Gmail, check ALLOWED_INBOX_LABELS
   - Wrong scope: read-only credentials used for send (must be separate app)

6. **QC always fails**
   - LUFS too high: confirm effort level setting; check thresholds in Module Settings
   - Sample rate mismatch: validate input files before session prep
   - Phase issues: check stem routing (summing mono sources to stereo)

7. **Dashboard won't load**
   - studio-brain-ui not running: `docker compose restart studio-brain-ui`
   - API proxy error: backend service down; check which API 503s in browser devtools
   - Self-signed cert warning: re-run `scripts/install_local_https.sh` and trust the cert

8. **Approval submitted but action didn't happen**
   - Worker in dry-run mode: expected behavior unless `STUDIO_WORKER_DRY_RUN_DAW=false`
   - Worker drained: Operations tab → Worker Runtime Control → resume
   - Job stuck in awaiting-approval: check audit log for double-approval state

---

### setup/01-quick-start.md

**Persona:** Self-Hosting Newcomer, Studio Owner (first install)
**Purpose:** Single machine, 20 minutes, fully functional — opinionated, no branches

**Format:** Pure step-by-step numbered list with expected output boxes after each step

**Steps:**
1. Prerequisites check (Docker, 16GB RAM, 20GB disk, Node 20 — check commands for each)
2. Clone: `git clone <repo> ai-audio-studio && cd ai-audio-studio`
3. Configure: `cp infra/env.example infra/.env` → edit the 8 mandatory fields (call them out explicitly)
4. Start Ollama: `bash scripts/start-ollama.sh` (shows model download progress)
5. Start stack: `docker compose --env-file infra/.env -f infra/docker-compose.yml up -d`
6. Wait for healthy: `docker compose ps` — all services show `(healthy)`
7. Import workflows: `bash scripts/bootstrap_n8n.sh infra/.env`
8. Open `http://localhost:3000` — you should see the dashboard
9. Complete setup questionnaire (Settings → Edit Setup)
10. Test: submit a test lead via the API (`curl` command provided)
11. Approve the test lead in the queue

**Mandatory env fields to call out:**
- `POSTGRES_PASSWORD` — set this, anything works
- `OPERATOR_API_TOKEN` — set this, must be long random string
- `WORKER_API_TOKEN` — set this, different from above
- `STUDIO_NAME` — your studio name
- `ENGINEER_NAME` — your name
- `ENGINEER_VOICE` — 1-2 sentence voice description
- `SHARED_PROJECTS_PATH` — where your audio project folders live
- `CONTROL_PLANE_HOST` — hostname or IP (127.0.0.1 for local-only)

---

### setup/02-split-mode.md

**Persona:** Studio Owner (two-machine setup)
**Purpose:** Mac mini as control plane + Mac Pro as DAW worker — full setup

**Sections:**
1. **When to Use Split Mode** — Pros (always-on control plane, live DAW on workstation), cons (more config)
2. **Network Prerequisites** — Both machines on same LAN, static IP for Mac mini, Bonjour/hostname setup
3. **Control Plane Setup (Mac mini)** — Standard stack, no DAW profile needed, set `BIND_HOST=0.0.0.0`
4. **Worker Setup (Mac Pro)** — `infra/docker-compose.worker.yml`, required env vars, pointing to control plane
5. **Path Translation** — Shared storage options: NFS, SMB, or path translation via `PATH_TRANSLATION_JSON`
   - NFS setup (recommended for audio): exports, mount points, performance tuning
   - SMB option: simpler but slower for large files
   - Path translation: when mount points differ between machines
6. **Firewall Rules** — Ports to open on Mac mini (8080, 8190, 3000, 443)
7. **Worker Registration** — How the worker auto-registers with project-state
8. **Verifying Split Mode** — Operations tab → workers, smoke test from UI

---

### setup/03-environment-variables.md

**Persona:** All
**Purpose:** Every environment variable, what it does, when it's required

**Format:** Table per section, columns: Variable | Default | Required | Description

**Sections:**
1. Database
2. n8n
3. Network & TLS
4. LLM / Ollama
5. Gmail (read + send, separate)
6. Social Media
7. Shared Paths
8. Studio Identity
9. Worker Configuration
10. DAW Paths
11. Security & Tokens
12. Alerts
13. Feature Flags (dry-run, policy enforcement, effort level)

---

### setup/04-ollama.md

**Persona:** Studio Owner, Developer Contributor
**Purpose:** Native Ollama — why native, how to set up, models, commercial fallback

**Sections:**
1. **Why Ollama Runs Outside Docker** — Apple Silicon Metal GPU, 10-40x inference speed vs. CPU-only Docker, 16GB OOM risk with containerized models
2. **Installation** — Ollama.ai download, install to /usr/local/bin
3. **Starting with the Helper Script** — `bash scripts/start-ollama.sh` walkthrough
4. **Models Used**
   - `qwen2.5:14b-instruct` — planner, orchestrator, assistant (7-8GB VRAM)
   - `qwen2.5:3b` — classifier, fast routing (2GB VRAM)
   - `nomic-embed-text` — embeddings (if used)
5. **Autostart with launchd** — Installing the plist, starting/stopping, log location
6. **Memory Management** — OLLAMA_MAX_LOADED_MODELS, OLLAMA_KEEP_ALIVE, what happens when models unload
7. **Commercial LLM Fallback** — When and why to use Anthropic/OpenAI
   - Setting `LLM_PROVIDER=anthropic` and `ANTHROPIC_API_KEY`
   - Setting `LLM_PROVIDER=openai` and `OPENAI_API_KEY`
   - Credential gap surface: what the UI shows when key is missing
   - Switching back to `LLM_PROVIDER=ollama`
8. **Verifying Ollama is Working** — `curl http://localhost:11434/api/tags`

---

### setup/05-https-and-lan.md

**Persona:** Studio Owner
**Purpose:** LAN HTTPS, Caddy, certificate trust — access from any device on the network

**Sections:**
1. **Why HTTPS on LAN** — Browser requirements, n8n OAuth callbacks, secure cookies
2. **Caddy Automatic Certificates** — How Caddy issues and renews self-signed LAN certs
3. **Setting Up LAN Access** — `CONTROL_PLANE_HOST`, `BIND_HOST=0.0.0.0`, `CONTROL_PLANE_LAN_IP`
4. **Trusting the Certificate**
   - Mac: `bash scripts/export_caddy_root_cert.sh` + Keychain trust
   - iOS: Profile installation
   - Other Macs: distribute the cert, trust in Keychain
5. **Access URLs** — `https://$CONTROL_PLANE_HOST`, `https://n8n.$CONTROL_PLANE_HOST`, `https://openclaw.$CONTROL_PLANE_HOST`
6. **Testing from Another Device** — Curl from iPhone, open in Safari

---

### setup/06-worker-setup.md

**Persona:** Studio Owner (split mode)
**Purpose:** Everything needed to get the Mac Pro running as a DAW execution worker

**Sections:**
1. **What the Worker Does** — Polls for tasks, claims them, executes DAW operations, reports back
2. **Docker Option (Recommended for Testing)** — `docker-compose.worker.yml`, required env vars
3. **Native Host Worker (Recommended for Production)** — launchd installation for persistent native execution
   - Why native is better for DAW integration (direct binary access, no container filesystem issues)
   - `bash scripts/install_host_studio_worker.sh`
   - Starting: `launchctl load ~/Library/LaunchAgents/com.ai-audio-studio.worker.plist`
4. **Required Environment Variables** — `PROJECT_STATE_URL`, `WORKER_SLUG`, `WORKER_API_TOKEN`, capabilities list, `SHARED_PROJECTS_PATH`
5. **DAW Path Configuration** — Pointing `REAPER_BINARY_PATH`, `PROTOOLS_APP_PATH`, etc. to actual installed locations
6. **Verifying Registration** — Operations tab → workers panel shows the worker as "healthy"
7. **Dry Run Mode** — Default: `STUDIO_WORKER_DRY_RUN_DAW=true`. What this means (preview only), when to disable.
8. **Worker Maintenance** — Drain (pause new task intake), resume, retire (permanent remove)

---

### reference/service-map.md

**Persona:** Developer Contributor, Self-Hosting Newcomer debugging
**Purpose:** Complete service directory — every service, its role, ports, dependencies, key endpoints

**Format:** One section per service with:
- Purpose (2 sentences)
- Port
- Docker profile (default / daw / local-worker)
- Key dependencies
- Key API endpoints (3-5 most important)
- Health check URL
- Where to find its logs

---

### reference/api-reference.md

**Persona:** Developer, advanced operator
**Purpose:** The API calls an operator or integration author would actually make

**Scope:** NOT a generated API spec — just the endpoints a human would call:
- Submit a lead manually
- Approve/reject a job
- Query the approval queue
- Check worker status
- View audit log
- Trigger a workflow manually
- Run workstation smoke test

**Format per endpoint:** HTTP method + path, purpose, request body example, response example

---

### reference/database-schema.md

**Persona:** Developer Contributor
**Purpose:** What lives in the database — tables, relationships, constraints

**Sections per table:**
- Purpose
- Key columns (not all columns — just the ones that matter)
- FSM column if applicable
- What gets written vs. what never changes (audit_log is append-only)
- Indexes and why

---

### reference/fsm-states.md

**Persona:** Developer Contributor, advanced operator
**Purpose:** The job FSM — every state, every transition, every trigger

**Format:**
- State transition diagram (ASCII)
- Table: State | Meaning | Who/What Triggers Entry | Allowed Next States | What's Blocked
- Notes on fail-closed behavior
- Notes on rejection (terminal state, never requeues automatically)

---

### reference/n8n-workflows.md

**Persona:** Studio Owner (advanced), Developer Contributor
**Purpose:** What each starter workflow does, webhook URLs, customization

**Sections:**
1. **The Bootstrap Process** — How workflows get imported, idempotency guarantee
2. **Workflow Directory** — One subsection per workflow:
   - What it listens for
   - What it does
   - Where it terminates (all terminate at OpenClaw dispatch)
   - Webhook URL pattern
   - Credential requirements
   - How to test it
3. **Building Custom Workflows** — Connecting custom n8n nodes to the platform dispatch endpoint
4. **Credential Setup in n8n** — Where to add Gmail, Instagram, Facebook creds in the n8n UI

---

### architecture/two-machine-design.md

**Persona:** Developer Contributor, Self-Hosting Newcomer (curious)
**Purpose:** Why split mode exists, how the two machines communicate, trade-offs

**Sections:**
1. **The Problem** — Control plane needs to be always-on; DAW workstation needs to be a creative tool, not a server
2. **Communication Pattern** — Worker polls project-state (pull, not push) — why pull over push
3. **Authentication** — Separate WORKER_API_TOKEN; worker never has operator-level access
4. **Shared Storage** — Why audio files can't be in the database; NFS vs. SMB vs. path translation trade-offs
5. **Single Machine Mode** — How `--profile local-worker` achieves the same result on one Mac
6. **Windows Worker** — Current scaffolding, what's needed to complete
7. **Heartbeat & Recovery** — How the control plane detects a dead worker, what lease recovery does

---

### architecture/safety-model.md

**Persona:** Developer Contributor, Self-Hosting Newcomer (trust building)
**Purpose:** Why approval-gated, why fail-closed, the full safety philosophy

**Sections:**
1. **The Core Commitment** — No outbound action without human approval. Full stop.
2. **Permission Tiers** — Why the four tiers exist, what each tier unlocks
3. **The FSM as Safety Mechanism** — Why a state machine vs. simple flags
4. **Defense in Depth** — Two independent approval checks (FSM state + send-worker re-verify)
5. **Separate Credentials** — Why read-only triage has different credentials from send
6. **The Actor System** — What `X-Actor` means, why all requests are attributed
7. **The Audit Log** — Append-only, what it proves, why it's never modified
8. **Dry-Run Default** — Why DAW execution is off by default, what turning it on means
9. **What the System Will Never Do Automatically** — Explicit list

---

## Execution Plan

### Phase 1: Core User Manual (Highest Priority)
Write first — these are what operators need most urgently.

| Doc | Priority | Effort | Notes |
|-----|----------|--------|-------|
| README.md expansion | CRITICAL | 2h | Gateway document; must be done first |
| guide/00-overview.md | CRITICAL | 1.5h | Mental model |
| guide/01-first-run.md | CRITICAL | 2h | Onboarding |
| guide/02-daily-operations.md | CRITICAL | 1.5h | Daily driver |
| guide/03-approval-workflow.md | HIGH | 1.5h | Core interaction |
| setup/01-quick-start.md | CRITICAL | 1.5h | Installation entry point |
| setup/03-environment-variables.md | HIGH | 2h | Most-referenced reference |

**Phase 1 total: ~12 hours of writing**

### Phase 2: Module Deep Dives
| Doc | Priority | Effort | Notes |
|-----|----------|--------|-------|
| guide/04-leads-and-inbox.md | HIGH | 1.5h | |
| guide/05-session-and-daw.md | HIGH | 2h | Complex, needs care |
| guide/06-audio-qc.md | HIGH | 1.5h | Technical — explain metrics |
| guide/07-revisions.md | HIGH | 1.5h | |
| guide/08-delivery.md | MEDIUM | 1h | |
| guide/09-social-content.md | MEDIUM | 1h | |
| guide/10-concierge.md | MEDIUM | 1h | |
| guide/11-settings-and-modules.md | HIGH | 2h | Big reference doc |
| guide/13-troubleshooting.md | HIGH | 2h | Most-used doc after launch |

**Phase 2 total: ~15 hours of writing**

### Phase 3: Setup & Integration Guides
| Doc | Priority | Effort | Notes |
|-----|----------|--------|-------|
| guide/12-integrations.md | HIGH | 2.5h | OAuth flows need precision |
| setup/02-split-mode.md | HIGH | 2h | |
| setup/04-ollama.md | HIGH | 1.5h | |
| setup/05-https-and-lan.md | MEDIUM | 1h | |
| setup/06-worker-setup.md | HIGH | 1.5h | |

**Phase 3 total: ~8.5 hours of writing**

### Phase 4: Reference & Architecture
| Doc | Priority | Effort | Notes |
|-----|----------|--------|-------|
| reference/service-map.md | MEDIUM | 2h | |
| reference/fsm-states.md | MEDIUM | 1h | |
| reference/n8n-workflows.md | MEDIUM | 1.5h | |
| reference/api-reference.md | LOW | 2h | Developer audience |
| reference/database-schema.md | LOW | 1.5h | Developer audience |
| architecture/two-machine-design.md | MEDIUM | 1h | |
| architecture/safety-model.md | MEDIUM | 1h | |

**Phase 4 total: ~10 hours of writing**

---

## Writing Standards

1. **Persona label on every doc:** "Written for: Studio Owner/Operator"
2. **Numbered steps for all procedures** — never prose for multi-step processes
3. **Expected output boxes** — after every command, show what success looks like
4. **Cross-links** — every doc links to prerequisite docs at the top ("Before reading this, complete guide/01-first-run.md")
5. **Screenshots** — placeholder notes in `[SCREENSHOT: ...]` format where the UI would help (screenshots taken separately)
6. **No jargon without definition** — FSM, LLM, LUFS, etc. are defined on first use in every doc
7. **"Why" before "How"** — every section explains the reason before the procedure
8. **Callout boxes** (rendered in Markdown via blockquotes):
   - `> ⚠️ Warning:` for dangerous actions (disabling dry-run, credential exposure)
   - `> ℹ️ Note:` for nuances
   - `> ✅ Checkpoint:` for "you should see X" validation points
9. **Consistent terminology** — never alternate between "approval queue" and "review queue"; pick one
10. **Active voice** — "Click Approve" not "The Approve button should be clicked"

---

## What We're NOT Writing

- Auto-generated API spec (Swagger/OpenAPI) — out of scope for this pass
- Video tutorials — future phase
- CHANGELOG.md — covered in audit10 Codex prompt
- CONTRIBUTING.md — covered in audit10 Codex prompt
- SECURITY.md — covered in audit10 Codex prompt
- Per-service README.md files — too granular; operators don't read service repos

---

## Total Documentation Volume

| Phase | Documents | Est. Writing Hours |
|-------|-----------|-------------------|
| Phase 1: Core User Manual | 7 | ~12h |
| Phase 2: Module Deep Dives | 9 | ~15h |
| Phase 3: Setup & Integration | 5 | ~8.5h |
| Phase 4: Reference & Architecture | 7 | ~10h |
| **Total** | **28 documents** | **~45.5h** |

---

## Suggested Execution Order for This Session

Given we're executing now, suggested order:
1. README.md (root) — critical gateway
2. guide/00-overview.md — mental model
3. guide/01-first-run.md — onboarding
4. setup/01-quick-start.md — installation
5. guide/02-daily-operations.md — daily use
6. guide/03-approval-workflow.md — core interaction
7. setup/03-environment-variables.md — most-referenced reference
8. Continue Phase 2 in listed order

Confirm this order or adjust, then execute document by document.

# Session Work and DAW Automation

**Written for:** Studio Owner/Operator using the DAW profile
**Requires:** `--profile daw` started, worker configured
**Prerequisite:** [Daily Operations](02-daily-operations.md)

---

## Overview

The DAW-facing modules automate the most time-consuming parts of session work:

- **Session Prep** — validates and organizes incoming stems into a clean project structure
- **Mix Planner** — reads the session and generates bounded mix decisions
- **Revision Parser** — converts client revision notes into structured DAW operations
- **Studio Worker** — executes the approved operations in Reaper, Pro Tools, or WaveLab

Everything is approval-gated. The worker doesn't touch your DAW until you've reviewed and approved an execution plan.

---

## Prerequisites

Before DAW modules will function:

1. **DAW profile started:**
   ```bash
   docker compose --profile daw --env-file infra/.env -f infra/docker-compose.yml up -d
   ```

2. **Worker running** — either the `local-worker` profile (same Mac) or the remote worker on your studio Mac. See [Setup: Worker Setup](../setup/06-worker-setup.md).

3. **Shared paths configured** — `SHARED_PROJECTS_PATH`, `WATCHED_STEMS_PATH`, and `DELIVERY_PATH` pointing to real, reachable directories. Set in `infra/.env` or the Settings questionnaire.

4. **DAW installed** — REAPER, Pro Tools + SoundFlow, or WaveLab must be installed on the machine running the worker.

---

## How Stems Arrive

Three paths to trigger session prep:

**Watched folder** (most common) — drop stems into `WATCHED_STEMS_PATH` (default: `/Volumes/StudioShare/incoming-stems`). The system detects the new files and starts session prep automatically.

**n8n webhook** — the `session-source-import-stems` workflow fires when files are deposited. Configure the trigger to match your delivery method (SFTP drop, file share notification, etc.).

**Manual submission** — post directly to session prep:
```bash
curl -X POST http://localhost:8150/prepare-session \
  -H "Content-Type: application/json" \
  -d '{"project_slug":"artist-ep-2026","stems_path":"/Volumes/StudioShare/incoming-stems/artist-ep"}'
```

---

## What Session Prep Does

Session prep runs several validation checks and creates a session manifest:

### Validation Checks

For each audio file found in the stems directory:

| Check | What it validates | Why it matters |
|-------|------------------|----------------|
| Sample rate | Is it 44.1kHz, 48kHz, 88.2kHz, 96kHz? | Mismatched rates cause pitch and timing issues |
| Bit depth | 16, 24, or 32-bit? | Conversion quality and noise floor |
| File format | WAV, AIFF, FLAC, MP3? | DAW compatibility |
| Duration | Is the file non-zero length? | Detects truncated or corrupt files |
| Channel count | Mono vs. stereo, is it consistent? | Routing and panning assumptions |
| Naming | Does it follow a parseable convention? | Makes organization and script generation cleaner |

Files that fail validation are flagged — not rejected. You decide in the approval card whether the issues are blockers.

### The Session Manifest

The session manifest is a JSON document (and summary shown in the approval card) containing:

- Complete stem inventory with validation status per file
- Proposed session folder structure
- Sample rate and bit depth summary for the set
- Issues list with severity (warning vs. error)
- Recommended session template (based on detected content)

After you approve session prep, this manifest becomes the source of truth for all downstream modules (mix planner, QC, delivery).

### Folder Structure Created

```
/Volumes/StudioShare/projects/artist-project-slug/
├── session/
│   ├── stems/
│   │   ├── drums/
│   │   ├── bass/
│   │   ├── guitars/
│   │   ├── keys/
│   │   └── vocals/
│   └── session-manifest.json
├── mix/
├── renders/
├── qc-reports/
└── deliveries/
```

Stem categorization (which file goes in which subfolder) is based on filename patterns. You can adjust after the fact.

---

## Approving Session Prep

The session prep approval card in Operations shows:

**Stem inventory summary** — file count, format breakdown, sample rate distribution, bit depth distribution

**Issues list** — flagged files with the specific problem and severity

**Proposed folder structure** — the directory tree that will be created

**Accept or investigate:**
- If issues are minor (naming inconsistency, one file is MP3 instead of WAV), approve and note it
- If issues are critical (half the stems are wrong sample rate, required tracks are missing), reject and communicate with the client before re-submitting

---

## Mix Planning

After session prep is approved, the mix planner can generate bounded mix decisions.

### What the Mix Planner Does

The mix planner reads:
- The session manifest (what stems exist, their characteristics)
- Your studio style profile (tone, references, aesthetic guidance)
- The project record (client name, service type, any notes)

It generates a structured mix plan containing:
- **Level decisions** — starting level assignments by stem category
- **EQ suggestions** — frequency guidance based on content analysis and style profile
- **FX routing** — send/return suggestions, parallel processing recommendations
- **Reference comparison points** — specific aspects to compare against reference tracks
- **Session notes** — anything unusual about this session worth flagging before you start

### Approving the Mix Plan

The mix plan is a starting point, not a prescription. After approval:
- The plan is available as reference in the Context tab
- If you're using DAW execution (execution plans), the approved mix plan feeds into the execution planning
- You can override any decision at mix time — the plan is your starting framework

---

## The Style Profile

The style profile is the most important customization for mix and session work.

### What It Is

A text document (or set of file references) that captures your studio's aesthetic signature. The mix planner reads it to generate style-consistent decisions.

### Setting It Up

In the dashboard: Settings → Style Profiles → Create / Edit Studio Profile

Options:
1. **Paste text** — write or paste a description of your production aesthetic
2. **Reference files** — link to mix notes, mood boards, or reference track lists
3. **Combined** — text description plus file references

### What to Include

Good style profile content:

> *"My mixes tend toward warm low mids. I'm conservative with high-end brightness — prefer 'present' over 'bright'. I use parallel compression on drums almost always. I reference Phoebe Bridgers (For Folk), Big Thief (Country), and Caroline Polachek (Pop) depending on the brief. I value space and dynamics over density. Vocals are always the loudest element; I mix to the vocal, not despite it."*

The more specific, the better. Vague guidance produces generic plans.

### Project-Level Profiles

For a client with a distinct aesthetic different from your defaults, create a project-level style profile:

Context tab → select project → Style Profile → Create Project Profile

Project profiles override the studio profile for that project only.

---

## Revision Parsing

When a client sends revision notes, the revision parser converts plain English into structured DAW operations.

### How Revision Notes Arrive

- Email classified as `revision-request` by inbox triage → revision parser triggered
- Webhook: `POST http://localhost:8160/parse-revisions`
- Manual submission with the notes text

### What the Parser Does

For each piece of revision feedback, the parser attempts to:
1. Identify the **target** (which track, bus, element)
2. Identify the **action** (level change, EQ, effect, timing)
3. Identify the **parameter** (specific value if given, or directional guidance)
4. Assign a **confidence score** based on ambiguity

### Confidence Scores in Practice

| Client says | Parser generates | Confidence |
|-------------|-----------------|------------|
| "Bring the kick down 2dB from bar 24" | Kick, level, -2dB, bar 24 | High |
| "The chorus vocal feels a bit buried" | Lead vocal, level, ↑ (indeterminate) | Medium |
| "Make it more emotional in the bridge" | ??? | Low (flagged as unparseable) |
| "Can you make the guitars breathe more?" | Guitars, dynamics/reverb (interpreted) | Low |

**High confidence** — approve without much review.

**Medium confidence** — review the mapping. The system's interpretation may be right, but read it.

**Low confidence** — always review carefully. The system made a guess. It may be wrong.

**Unparseable** — the system flagged this item and will skip it. You'll see it in the execution plan with a note that it couldn't be converted. Handle it manually or re-submit with clearer language.

### Reviewing the Execution Plan

Before approving execution, you see a complete list of what will run:

- Plain-English summary of each change
- The target DAW (Reaper/ReaScript or Pro Tools/SoundFlow)
- The generated script preview
- Confidence scores per item
- Any skipped/unparseable items

You can remove individual changes from the plan before approving. Removed changes are skipped (not executed) but logged with a note.

---

## Live DAW Execution

> ⚠️ **Dry-run mode is on by default.** `STUDIO_WORKER_DRY_RUN_DAW=true` means the worker generates execution plans but doesn't actually touch your DAW. This is the right setting to start with. Enable live execution only after you've validated the dry-run plans look correct.

### Enabling Live Execution

In `infra/.env` on the machine running the worker:
```bash
STUDIO_WORKER_DRY_RUN_DAW=false
```

Restart the worker after changing this.

> ⚠️ **Live execution on what's in your DAW right now.** The worker operates on the currently open project. Make sure your DAW is in the right state (right session open, saved) before approving an execution plan.

### After Execution

1. Worker completes the ReaScript or SoundFlow operations
2. Audio QC automatically runs on any resulting renders
3. Listening report is generated
4. Results appear in Context tab → project → Renders and QC Reports
5. If QC passes: delivery packaging can proceed
6. If QC fails: the issue is surfaced with recommended next steps

---

## Workstation Validation (Dry Run Smoke)

Before you trust live execution, run the workstation validation from the Operations tab.

**Setup Validation** — scans the worker machine:
- DAW application presence (REAPER, Pro Tools, SoundFlow, WaveLab)
- Plugin inventory
- Path reachability (can the worker reach the shared storage?)
- Worker registration status

**Dry-Run Smoke** — runs a full planning rehearsal without touching any live project:
- Generates a disposable session manifest
- Creates a test mix plan
- Creates a test listening report
- Creates a test render plan
- Creates a test execution plan
- Reports success/failure at each step

If the smoke test passes, your worker is correctly configured for live execution.

Run this from: Operations tab → Setup Validation → Run Dry-Run Smoke.

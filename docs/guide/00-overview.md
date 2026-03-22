# AI Audio Studio — What It Is and How to Think About It

**Written for:** Everyone — read this before anything else

---

## The Problem This Solves

Running a recording studio means two jobs: the creative work you love, and the administrative layer you didn't sign up for. Replying to every lead inquiry, triaging client emails, writing social captions, organizing incoming stems, parsing revision notes, running QC on renders, assembling delivery packages — none of it is creative work, but all of it eats hours every week.

AI Audio Studio is an automation platform that takes over the administrative layer while keeping you in control of every decision that matters. It drafts, analyzes, organizes, and prepares — but it never sends an email, executes a DAW script, or delivers a file without your explicit approval first.

For most studios, the administrative overhead runs four to eight hours per week. This system compresses that to fifteen to thirty minutes of queue reviews.

---

## What the System Handles Automatically

These things happen without you asking:

- A new lead comes in from your contact form → the system extracts the details, scores fit and urgency, drafts a reply in your voice
- An email lands in your "NeedsReply" Gmail label → the system classifies it, drafts a response
- A social content brief arrives → the system generates platform-specific captions with hashtags
- Stems land in your incoming folder → the system validates sample rates, bit depth, naming, and organizes them into a session structure
- Client revision notes come in → the system parses them into structured DAW change objects with confidence scores
- A render is complete → the system measures LUFS, true peak, phase coherence, and spectral balance
- QC passes → the system assembles the delivery package

Every single one of these ends the same way: something lands in your approval queue and waits. Nothing proceeds further until you say yes.

---

## What Always Requires Your Approval

No exceptions:

- Sending any email (reply to lead, reply to client, any outbound message)
- Executing any DAW operation (mix changes, session edits, ReaScript/SoundFlow execution)
- Posting to social media
- Delivering files to a client
- Any action that touches money, relationships, or creative decisions

The system is designed so that the worst thing it can do without you is write a draft and put it in a queue. Everything else is gated.

---

## The Two Machines

The system is built around two roles. You can run both on one machine, or split them:

```
┌─────────────────────────────────┐    ┌─────────────────────────────────┐
│   CONTROL PLANE                 │    │   STUDIO WORKER                 │
│   (always-on Mac)               │    │   (your DAW workstation)        │
│                                 │    │                                 │
│  • Dashboard (Studio Brain UI)  │    │  • Executes DAW operations      │
│  • Job state and approval queue │◄──►│  • Runs session prep            │
│  • Automation modules           │    │  • Processes revisions          │
│  • n8n workflow automation      │    │  • Packages deliveries          │
│  • Local LLM (Ollama)           │    │  • Scans plugins/DAWs           │
│  • Postgres database            │    │                                 │
└─────────────────────────────────┘    └─────────────────────────────────┘
          ▲                                         ▲
          │                                         │
          └───────── Shared Storage ────────────────┘
                 /Volumes/StudioShare/
```

**Single machine mode:** One Mac does everything. Simplest setup, works great for most studios.

**Split mode:** The control plane runs on a Mac mini or similar always-on machine. Your Mac Pro or main studio Mac runs the worker for DAW operations. The worker polls the control plane for tasks, executes them locally on your DAW machine, and reports back.

Either way, the dashboard runs on the control plane and you access it from any browser on your network.

---

## The Five Automation Modules

### 1. Client Communication
**Lead Intake** + **Inbox Triage**

Handles the front door. Normalizes incoming leads from any source (forms, DMs, emails, referrals), scores them, and drafts a first reply. Monitors a Gmail label for client emails and drafts responses. Both are approval-gated before anything sends.

### 2. Content
**Social/Content Pipeline**

Takes a content brief and generates platform-specific captions for Instagram, Facebook, Threads, and LinkedIn — respecting character limits, your studio voice, and brand context. Hashtag pools are generated deterministically. Approval-gated before any posting.

### 3. Session Work
**Session Prep** + **Mix Planner**

Watches for incoming stems, validates audio files (sample rate, bit depth, format, channel count, naming), and organizes them into a clean project structure with a session manifest. The mix planner reads that manifest along with your style profile and generates bounded mix decisions — levels, EQ suggestions, FX routing, reference comparison points.

### 4. Quality Control
**Audio QC**

Runs objective measurements on rendered files: LUFS integrated loudness, true peak dBFS, clipping detection, phase coherence, mono compatibility, spectral tilt, and low-end energy ratio. Configurable thresholds by effort level. If it passes, it routes to delivery. If it fails, it surfaces the issue with recommendations.

### 5. Production & Delivery
**Revision Parser** + **Delivery Packager**

Converts client revision notes (plain English) into structured DAW change objects with confidence scoring, ready to execute in Reaper (ReaScript) or Pro Tools (SoundFlow). Delivery packaging is gated behind a passing QC report — you can't package something that hasn't passed measurement thresholds.

---

## The Permission Tier Model

Not all automation is equal. The system enforces a four-tier model that makes the risk of each action explicit:

| Tier | Name | What It Can Do | Examples |
|------|------|----------------|---------|
| 1 | Read | Observe and analyze only | File watching, inbox reading, audio measurement |
| 2 | Draft | Write to queue, never send | Email drafts, social captions, session manifests |
| 3 | Queue | Request human approval | Lead replies, revision plans, delivery packages |
| 4 | Narrow Auto | Pre-approved bounded actions | File organization, session folder structure |

The system never escalates beyond its assigned tier without an explicit orchestration rule change. Tier 3 means "ask the human." Tier 4 means "this exact bounded action is pre-approved."

---

## Where Your Data Lives

Everything stays on your hardware:

- The database (Postgres) runs in Docker on your control plane machine
- Audio files live on your local storage or shared volume — never uploaded anywhere
- The LLM (Ollama) runs natively on your Mac — no API calls for inference by default
- The only optional external calls are to Anthropic/OpenAI if you choose the commercial LLM provider — and only for text drafting/analysis, never audio

If you use Gmail or social integrations, OAuth tokens are stored in your `.env` file on your machine. The system uses them to read/post on your behalf after your approval.

---

## A Day in the Life

**8:30am** — You open the dashboard. The Overview tab shows two pending approvals (a lead reply and an inbox draft). There's a green workstation status — your worker is healthy.

**8:32am** — You click over to Operations. The lead reply looks good — right tone, accurate details. You click Approve. The inbox draft is for a revision request that came in overnight — you edit the reply slightly, then approve.

**9:15am** — A client sends stems over the watched folder. Session prep runs, validates 14 files, creates a manifest. One file has a naming issue — the system flags it but doesn't block the queue. You see the flag, note it, and approve the session prep anyway with a comment.

**10:00am** — You're in a session. The system is running in the background. Nothing else requires attention.

**2:30pm** — Revision notes from a client arrive via email. The revision parser converts them into a structured execution plan — 8 changes parsed with high confidence, 2 flagged as ambiguous. You review the plan, remove one change you disagree with, and approve the rest. The worker executes the ReaScript changes in Reaper.

**4:00pm** — The render comes back from QC: -14.2 LUFS integrated, -0.8 dBTP, phase coherent, mono compatible. All green. You approve delivery packaging. The client-facing folder is assembled.

**4:05pm** — The delivery package approval appears in the queue. You check the file list, confirm the structure is right, and approve. Done.

Total approval time today: about 25 minutes, spread across the whole day.

---

## What This System Is Not

- It is not fully automated. Every client-facing action requires your approval.
- It is not a cloud service. Everything runs on your hardware.
- It is not a finished product yet. The control plane is solid and production-ready; DAW execution (live ReaScript/SoundFlow/WaveLab) is still being validated on real hardware.
- It is not magic. The LLM drafts are good but you should always read them before approving.

---

## Where to Go Next

- **First time here?** → [Setup: Quick Start](../setup/01-quick-start.md)
- **Already installed, starting your first day?** → [Guide: First Run](01-first-run.md)
- **Just want to understand approvals?** → [Guide: Approval Workflow](03-approval-workflow.md)
- **Two machines?** → [Setup: Split Mode](../setup/02-split-mode.md)

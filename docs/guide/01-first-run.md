# First Run — From Zero to Your First Approval

**Written for:** Studio Owner/Operator setting up for the first time
**Time required:** 30–45 minutes
**Prerequisite:** [Overview: What This Is](00-overview.md)

---

## Before You Start

Check these before doing anything else:

| Requirement | How to verify |
|------------|---------------|
| Docker Desktop installed and running | Open Docker Desktop — whale icon in menu bar |
| At least 16 GB RAM on this machine | Apple menu → About This Mac |
| At least 20 GB free disk space | `df -h /` in Terminal |
| macOS (Apple Silicon recommended) | This setup is macOS-native |
| Terminal access | Open Terminal.app |

> ⚠️ **16 GB minimum:** The local LLM (Ollama with qwen2.5:14b) requires substantial memory. On a 16 GB machine, close other heavy apps (browsers with many tabs, Xcode, other Docker stacks) before starting. An 8 GB machine will work with degraded LLM performance — the classifier model (3B) will still run, but the planner (14B) will be slow.

---

## Step 1 — Clone the Repository

```bash
git clone <repo-url> ai-audio-studio
cd ai-audio-studio
```

> ✅ **Checkpoint:** You should see a directory listing with `infra/`, `services/`, `apps/`, `scripts/`, and `docs/`.

---

## Step 2 — Configure Your Environment

```bash
cp infra/env.example infra/.env
```

Now open `infra/.env` in a text editor. You need to fill in **eight required fields** before the stack will run correctly. Leave everything else at its default for now.

### The Eight Required Fields

**Database password** — set this to anything, just make it non-default:
```
POSTGRES_PASSWORD=your-strong-password-here
```

**n8n password** — the n8n workflow editor login:
```
N8N_PASSWORD=your-n8n-password-here
```

**Operator API token** — used by the dashboard to authenticate with backend services. Must be a long random string:
```
OPERATOR_API_TOKEN=make-this-a-long-random-string-32chars+
```

**Worker API token** — separate token for worker authentication. Must be different from OPERATOR_API_TOKEN:
```
WORKER_API_TOKEN=different-long-random-string-here
```

**Your studio name:**
```
STUDIO_NAME=Hollow Sun Studio
```

**Your name:**
```
ENGINEER_NAME=Kylie-Grace
```

**Your communication voice** — this is how the system will write emails and messages on your behalf. One or two sentences describing your style:
```
ENGINEER_VOICE=Warm, direct, and professional. Values clear timelines and creative clarity over industry jargon.
```

**Your projects folder** — where your audio project folders live on this machine:
```
SHARED_PROJECTS_PATH=/Volumes/StudioShare/projects
```
If you don't have a shared volume yet, use a local path: `/Users/your-name/Studio/projects`

> ℹ️ **Everything else is optional for now.** Gmail, social media, split-mode worker settings, and alerts can all be configured later through the dashboard. The system will run without them.

---

## Step 3 — Start Native Ollama

The local LLM runs natively on your Mac — not in Docker. This is deliberate: Docker on Apple Silicon can't pass through the Metal GPU, so inference would be CPU-only and 10-40x slower.

```bash
bash scripts/start-ollama.sh
```

This script:
1. Sets memory and concurrency limits for Ollama
2. Starts the Ollama server if it isn't already running
3. Pulls `qwen2.5:14b-instruct` (the planner model — about 8.5 GB download)
4. Pulls `qwen2.5:3b` (the classifier model — about 2 GB download)

The downloads take 5–20 minutes depending on your connection. You'll see download progress bars.

> ✅ **Checkpoint:** When complete, you should see `qwen2.5:14b-instruct` and `qwen2.5:3b` in the model list. Verify with:
> ```bash
> curl http://localhost:11434/api/tags
> ```
> You should see both model names in the response.

> ℹ️ **Want Ollama to start automatically on login?** Install the launchd plist:
> ```bash
> cp scripts/com.ai-audio-studio.ollama.plist ~/Library/LaunchAgents/
> launchctl load ~/Library/LaunchAgents/com.ai-audio-studio.ollama.plist
> ```

---

## Step 4 — Start the Docker Stack

```bash
docker compose --env-file infra/.env -f infra/docker-compose.yml up -d
```

This starts all core services: Postgres, n8n, project-state, crm-api, openclaw, content-pipeline, lead-intake, inbox-triage, studio-brain-ui, and Caddy (HTTPS front door).

The first start takes 2–4 minutes as Docker pulls images and the database initializes.

> ✅ **Checkpoint:** Run `docker compose --env-file infra/.env -f infra/docker-compose.yml ps` and confirm all services show as `healthy`. It may take 60–90 seconds for all health checks to pass.

**Optional: Add the DAW profile** (if you have audio QC, session prep, revision parsing, mix planning, or delivery packaging):
```bash
docker compose --profile daw --env-file infra/.env -f infra/docker-compose.yml up -d
```

---

## Step 5 — Import Starter Workflows

```bash
bash scripts/bootstrap_n8n.sh infra/.env
```

This imports eight workflow templates into n8n. It's idempotent — safe to run multiple times, skips workflows that already exist.

> ✅ **Checkpoint:** The script should complete with no errors and print something like "workflows imported" or "already exist, skipping". You can also verify by opening `http://localhost:5678` and checking the Workflows list.

---

## Step 6 — Open the Dashboard

```
http://localhost:3000
```

You should see the Studio Brain UI with the Overview tab loaded.

> ✅ **Checkpoint:** The overview panel loads and shows service health status. Some services may show "warming up" — that's normal for the first 30 seconds.

---

## Step 7 — Complete the Setup Questionnaire

In the dashboard, click **Settings** in the top navigation, then **Edit Setup**.

This questionnaire persists your studio's configuration into the database. Fill in every section:

### Identity
- **Studio Name** — your studio name (pre-filled from env if you set it)
- **Engineer Name** — your name

### Engineer Voice
This is the most important setting for quality drafts. Write 1–3 sentences describing how you communicate:

Good example:
> *"Direct and warm. I value the human behind every project and write like it. I never use industry buzzwords when plain language will do, and I'm honest about timelines."*

Bad example:
> *"Professional and concise."* — Too vague; won't produce distinctive drafts.

### Shared Paths
These are the filesystem paths the system uses for audio work:

| Field | What it is | Example |
|-------|-----------|---------|
| Projects Path | Parent folder for all project folders | `/Volumes/StudioShare/projects` |
| Deliveries Path | Where packaged deliveries go | `/Volumes/StudioShare/deliveries` |
| Draft Queue Path | Internal staging for drafts | `/Volumes/StudioShare/draft-queue` |
| Approval Queue Path | Internal staging for approval items | `/Volumes/StudioShare/approval-queue` |
| Incoming Stems Path | Watched folder for new stems | `/Volumes/StudioShare/incoming-stems` |

> ℹ️ **These paths don't need to exist yet.** The system will warn you but won't fail if paths are unreachable. Set them to wherever your studio files live — even if that volume isn't mounted right now.

### Alert Configuration
- **Alert Webhook URL** — optional. If you have a Slack, Discord, or Make.com webhook, paste it here to receive runtime escalations. Leave blank for dashboard-only alerts.
- **Alert Email** — optional. An email address for critical escalations.

### Worker Settings
For a **single machine** setup (running everything on one Mac), leave these at their defaults. The single-machine mode is pre-configured.

For a **split mode** setup (separate control plane + DAW workstation), see [Setup: Split Mode](../setup/02-split-mode.md) before filling this in.

### Save
Click **Save Settings**. You should see a confirmation that settings were persisted.

---

## Step 8 — Test the Approval Flow

Let's verify end-to-end that the system works by submitting a test lead.

Open a new Terminal tab and run:

```bash
curl -s -X POST http://localhost:8130/webhook/lead-intake \
  -H "Content-Type: application/json" \
  -d '{
    "source": "form",
    "raw_input": "Hey, I have a 6-track EP ready to mix. Looking for someone who can handle it this month. Budget around $800. References: Phoebe Bridgers, boygenius. Let me know if you have availability."
  }'
```

Now go back to the dashboard and click **Operations** in the top navigation.

> ✅ **Checkpoint:** You should see a new item in the **Approval Queue** under the Lead Drafts tab. The system analyzed the lead (source: form, service type: mixing, budget signal: $800, references: indie/folk) and drafted an initial reply.

Click the approval card to expand it. Review the draft reply. If you like it, click **Approve**. If not, edit the text and then approve, or click **Reject**.

You've just completed your first approval cycle.

---

## You're Ready

The system is running. Here's what to do next:

- **Read about daily operations** → [Guide: Daily Operations](02-daily-operations.md)
- **Understand the approval queue** → [Guide: Approval Workflow](03-approval-workflow.md)
- **Set up Gmail** → [Guide: Integrations](12-integrations.md)
- **Set up the DAW worker** → [Setup: Worker Setup](../setup/06-worker-setup.md)
- **Two machines?** → [Setup: Split Mode](../setup/02-split-mode.md)

---

## Appendix: First-Run Troubleshooting

**Stack won't start / services unhealthy**
- Wait 2 more minutes — Postgres initialization takes time on first boot
- Check logs: `docker compose -f infra/docker-compose.yml logs db`
- Common cause: `POSTGRES_PASSWORD` left as default `changeme_strong_password_here`

**Ollama model download stuck**
- Check disk space: `df -h ~`
- Check Ollama is running: `curl http://localhost:11434/api/tags`
- Re-run: `bash scripts/start-ollama.sh`

**Dashboard shows blank or error**
- Check studio-brain-ui is healthy: `docker compose ps studio-brain-ui`
- Try hard refresh: Cmd+Shift+R
- Check browser console for API errors

**Test lead didn't appear in queue**
- Check lead-intake is healthy: `curl http://localhost:8130/health`
- Check docker compose logs: `docker compose -f infra/docker-compose.yml logs lead-intake`

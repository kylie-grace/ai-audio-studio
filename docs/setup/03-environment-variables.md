# Environment Variables Reference

**Written for:** All — reference when configuring or troubleshooting
**File location:** `infra/.env` (copy from `infra/env.example`)

> ⚠️ **Never commit `infra/.env`** — it contains passwords and tokens. It is in `.gitignore` by default.

---

## How to Read This Reference

Each variable is listed with:
- **Default value** (from `env.example`)
- **Required?** — `required` means the stack won't function correctly without it; `optional` means the feature is disabled if unset
- **Description** — what it does and when to change it

---

## Database

| Variable | Default | Required | Description |
|---------|---------|----------|-------------|
| `POSTGRES_DB` | `studiodb` | required | Database name. Safe to leave as default. |
| `POSTGRES_USER` | `studio` | required | Database user. Safe to leave as default. |
| `POSTGRES_PASSWORD` | `changeme_strong_password_here` | required | **Change this before first run.** Used by all services. |

---

## n8n Workflow Automation

| Variable | Default | Required | Description |
|---------|---------|----------|-------------|
| `N8N_DB` | `n8ndb` | required | n8n's internal database name. Leave as default. |
| `N8N_USER` | `admin` | required | n8n web UI login username. |
| `N8N_PASSWORD` | `changeme_n8n_password_here` | required | **Change before first run.** n8n web UI password. |
| `N8N_WEBHOOK_URL` | `http://localhost:5678` | required | Base URL n8n uses to construct webhook URLs. Set to `http://<control-plane-ip>:5678` for LAN access, or your HTTPS hostname. |

---

## Network Exposure

| Variable | Default | Required | Description |
|---------|---------|----------|-------------|
| `BIND_HOST` | `0.0.0.0` | required | Interface for services to bind to. `0.0.0.0` = full LAN access. `127.0.0.1` = local-only (no access from other devices). |
| `CONTROL_PLANE_HOST` | `studio-brain.local` | optional | Hostname for TLS certificate (Caddy). Set this to your Mac's local hostname or a `/etc/hosts` entry. |
| `CONTROL_PLANE_LAN_IP` | `192.168.1.50` | optional | Static LAN IP of the control plane. Used by Caddy for certificate SAN. Set to your Mac's actual LAN IP. |

---

## LLM and Ollama

| Variable | Default | Required | Description |
|---------|---------|----------|-------------|
| `OLLAMA_BASE_URL` | `http://host.docker.internal:11434` | required | Where Docker services reach Ollama. `host.docker.internal` is the Docker-to-host bridge — leave this unless you've moved Ollama. |
| `PLANNER_MODEL` | `qwen2.5:14b-instruct` | required | The large reasoning model used for drafting, planning, and the concierge. |
| `CLASSIFIER_MODEL` | `qwen2.5:3b` | required | The small fast model used for classification and routing. |
| `CONCIERGE_LLM_TIMEOUT_SECONDS` | `120` | optional | How long to wait for an LLM response before timing out. Increase if using a slower machine. |
| `EMBEDDING_MODEL` | `nomic-embed-text` | optional | Embedding model for project memory/retrieval. Not required for basic operation. |
| `OLLAMA_MAX_LOADED_MODELS` | `1` | optional | Maximum simultaneous models in memory. Keep at `1` on 16 GB machines. |
| `OLLAMA_KEEP_ALIVE` | `30m` | optional | How long to keep models loaded after the last request. `30m` means models unload after 30 minutes of inactivity, freeing memory. |
| `LLM_PROVIDER` | `ollama` | required | Which LLM backend to use. Options: `ollama` (local), `anthropic`, `openai`. |
| `ANTHROPIC_API_KEY` | *(empty)* | optional | Required only if `LLM_PROVIDER=anthropic`. Get from console.anthropic.com. |
| `OPENAI_API_KEY` | *(empty)* | optional | Required only if `LLM_PROVIDER=openai`. Get from platform.openai.com. |

### Model names when using commercial providers

If switching from Ollama to a commercial provider, update the model names too:

```bash
# Anthropic:
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
PLANNER_MODEL=claude-sonnet-4-6
CLASSIFIER_MODEL=claude-haiku-4-5-20251001

# OpenAI:
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-...
PLANNER_MODEL=gpt-4o
CLASSIFIER_MODEL=gpt-4o-mini
```

---

## Gmail — Inbox Triage (Read-Only)

These credentials are used **only** by the inbox-triage service to read emails. They cannot send anything.

| Variable | Default | Required | Description |
|---------|---------|----------|-------------|
| `GMAIL_CLIENT_ID` | *(empty)* | optional | OAuth 2.0 Client ID from Google Cloud Console. |
| `GMAIL_CLIENT_SECRET` | *(empty)* | optional | OAuth 2.0 Client Secret. |
| `GMAIL_REFRESH_TOKEN` | *(empty)* | optional | Long-lived refresh token for gmail.readonly scope. |
| `ALLOWED_INBOX_LABELS` | `NeedsReply,Clients,Leads` | optional | Comma-separated Gmail label names to watch. The system only reads emails with these labels. |

See [Guide: Integrations — Gmail](../guide/12-integrations.md#gmail-read-only-inbox-triage) for the full OAuth setup flow.

---

## Gmail — Approved Send (Separate Credentials)

> ⚠️ **These are separate credentials from inbox triage.** The send service has write access (gmail.send scope). It must be a different OAuth application. This separation is intentional — read and write credentials are never combined.

| Variable | Default | Required | Description |
|---------|---------|----------|-------------|
| `GMAIL_SEND_CLIENT_ID` | *(empty)* | optional | OAuth 2.0 Client ID for the send-only app. |
| `GMAIL_SEND_CLIENT_SECRET` | *(empty)* | optional | OAuth 2.0 Client Secret for send. |
| `GMAIL_SEND_REFRESH_TOKEN` | *(empty)* | optional | Refresh token for gmail.send scope. |

---

## Social Media

All social publishing is draft-only until approved. These tokens are only used when a social caption is approved and the publishing workflow is configured.

| Variable | Default | Required | Description |
|---------|---------|----------|-------------|
| `INSTAGRAM_ACCESS_TOKEN` | *(empty)* | optional | Instagram Graph API access token. Requires Instagram Business account connected to a Facebook Page. |
| `FACEBOOK_PAGE_ID` | *(empty)* | optional | Facebook Page ID (not profile ID). Found in Page settings. |
| `FACEBOOK_ACCESS_TOKEN` | *(empty)* | optional | Facebook Page Access Token (not User token — they're different). Must have `pages_manage_posts` permission. |

---

## Shared Volume Paths

These paths must be reachable by the machine running the relevant services.

| Variable | Default | Required | Description |
|---------|---------|----------|-------------|
| `SHARED_PROJECTS_PATH` | `/Volumes/StudioShare/projects` | required | Parent directory for all project folders. Where session prep organizes stems. |
| `DRAFT_QUEUE_PATH` | `/Volumes/StudioShare/draft-queue` | optional | Internal staging area for drafted content (managed by the system). |
| `APPROVAL_QUEUE_PATH` | `/Volumes/StudioShare/approval-queue` | optional | Internal staging area for approved content (managed by the system). |
| `WATCHED_STEMS_PATH` | `/Volumes/StudioShare/incoming-stems` | optional | Folder watched for incoming stem uploads. Drop stems here to trigger session prep. |
| `DELIVERY_PATH` | `/Volumes/StudioShare/deliveries` | optional | Where completed delivery packages are written. |

> ℹ️ **Single machine:** These can be local paths (e.g., `/Users/your-name/Studio/projects`). The `/Volumes/StudioShare/` convention is for NFS/SMB shared volumes in split-mode deployments.

---

## Studio Identity

These values appear in AI-generated drafts and communications.

| Variable | Default | Required | Description |
|---------|---------|----------|-------------|
| `STUDIO_NAME` | `Your Studio Name` | required | Your studio's name. Appears in email signatures, session documents. |
| `ENGINEER_NAME` | `Your Name` | required | Your name. Used in drafts and the audit log. |
| `ENGINEER_VOICE` | *(example text)* | required | 1–2 sentences describing your communication style. The quality of this setting directly affects draft quality. |
| `DEFAULT_EFFORT_LEVEL` | `2` | optional | Default automation depth for new projects. `1`=import-only, `2`=+QC, `3`=+mix-plan, `4`=full pipeline. |

---

## Security and Authentication

| Variable | Default | Required | Description |
|---------|---------|----------|-------------|
| `AUTHORIZED_ACTORS` | `owner,engineer` | required | Comma-separated list of actor names allowed to approve/reject jobs. These are the values that appear in `X-Actor` request headers. |
| `OPERATOR_API_TOKEN` | `change-me-operator-token` | required | **Change before first run.** Token used by the dashboard to authenticate with backend services. Must be a long random string. |
| `WORKER_API_TOKEN` | `change-me-worker-token` | required | **Change before first run.** Separate token for worker authentication. Must be different from `OPERATOR_API_TOKEN`. |
| `POLICY_ENFORCEMENT` | `strict` | required | `strict` = all approval checks enforced. `permissive` = warnings only. **Never use `permissive` in production.** |

---

## Studio Worker Node (Split Mode Only)

Leave these unset for single-machine deployments.

| Variable | Default | Required (split mode) | Description |
|---------|---------|----------|-------------|
| `MAC_MINI_BASE_URL` | `http://192.168.1.50` | required | LAN URL of the control plane. Worker uses this to reach project-state. |
| `WORKER_SLUG` | `studio-mac` | required | Unique identifier for this worker node. Used in logs and the dashboard. |
| `WORKER_DISPLAY_NAME` | `Studio Mac` | optional | Human-readable name shown in the Operations tab. |
| `WORKER_PLATFORM` | `macos` | required | `macos` or `windows`. |
| `WORKER_API_BASE_URL` | `http://192.168.1.60:8190` | required | LAN URL where the worker is reachable from the control plane. Do not use loopback. |
| `WORKER_CAPABILITIES` | `session-prep,revision-parser,delivery-packager` | required | Comma-separated list of task types this worker can handle. |
| `POLL_INTERVAL_SECONDS` | `10` | optional | How often the worker polls for new tasks. Increase to reduce control plane load. |
| `STUDIO_WORKER_DRY_RUN_DAW` | `true` | required | `true` = generate plans but don't execute in DAW. `false` = live execution. **Start with `true` and validate before enabling live execution.** |

### Local Worker Profile (Same Machine)

| Variable | Default | Description |
|---------|---------|-------------|
| `LOCAL_WORKER_SLUG` | `local-studio-worker` | Identifier for the local worker (used with `--profile local-worker`). |
| `LOCAL_WORKER_DISPLAY_NAME` | `Local Studio Worker` | Display name for local worker. |
| `LOCAL_WORKER_CAPABILITIES` | `session-prep,revision-parser,delivery-packager,execute-soundflow,execute-reascript` | Full capability set including DAW execution. |

---

## DAW Application Paths

Used by the studio worker to locate DAW applications.

| Variable | Default | Description |
|---------|---------|-------------|
| `REAPER_BINARY_PATH` | `/Applications/REAPER.app/Contents/MacOS/REAPER` | Path to REAPER binary (macOS). |
| `PROTOOLS_APP_PATH` | `/Applications/Pro Tools.app` | Path to Pro Tools application bundle (macOS). |
| `SOUNDFLOW_CLI_PATH` | `/Applications/SoundFlow.app/Contents/MacOS/SoundFlow` | Path to SoundFlow CLI (macOS). Required for Pro Tools automation. |
| `WAVELAB_APP_PATH` | *(empty)* | Path to WaveLab application (macOS or Windows). |
| `PATH_TRANSLATION_JSON` | `{}` | JSON map of path prefixes for cross-machine translation. Example: `{"/Volumes/StudioShare":"/Volumes/ControlPlaneShare"}` |

### Windows DAW paths

For Windows workers:
```bash
WORKER_PLATFORM=windows
REAPER_BINARY_PATH=C:\Program Files\REAPER (x64)\reaper.exe
PROTOOLS_APP_PATH=C:\Program Files\Avid\Pro Tools\ProTools.exe
WAVELAB_APP_PATH=C:\Program Files\Steinberg\WaveLab 12\WaveLab 12.exe
PATH_TRANSLATION_JSON={"/Volumes/StudioShare":"Z:\\StudioShare"}
```

---

## Alerts and Escalation

| Variable | Default | Required | Description |
|---------|---------|----------|-------------|
| `ALERT_WEBHOOK_URL` | *(empty)* | optional | POST URL for runtime alerts. Supports any webhook endpoint (Slack, Discord, Make.com, Zapier). Leave empty for dashboard-only alerts. |
| `ALERT_EMAIL_TO` | *(empty)* | optional | Email address for critical escalations. Leave empty if not using email alerts. |
| `MAX_DRAFT_AGE_HOURS` | `48` | optional | How long a draft can sit in the approval queue before auto-expiring. Expiry removes from queue — never sends. |

---

## Safety Policy

| Variable | Default | Required | Description |
|---------|---------|----------|-------------|
| `POLICY_ENFORCEMENT` | `strict` | required | See Security section above. Always use `strict`. |
| `MAX_DRAFT_AGE_HOURS` | `48` | optional | See Alerts section above. |

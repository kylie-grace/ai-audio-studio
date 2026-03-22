# Quick Start — Single Machine, 20 Minutes

**Written for:** New installs on a single Mac
**Time required:** 20–40 minutes (plus model download time)
**Prerequisite:** Docker Desktop installed and running

This is the opinionated fast path. One machine, one command sequence, working system. No branches, no options — just the steps that work.

---

## Prerequisites Check

Run these in Terminal to verify your machine is ready:

```bash
# Docker running?
docker info | grep "Server Version"

# Enough RAM? (need 16GB minimum)
system_profiler SPHardwareDataType | grep "Memory:"

# Enough disk? (need 20GB free minimum)
df -h / | awk 'NR==2 {print $4 " available"}'

# Ollama installed? (install from https://ollama.ai if not)
which ollama && ollama --version
```

If any check fails, address it before continuing.

---

## The 11 Steps

### 1. Clone

```bash
git clone <repo-url> ai-audio-studio
cd ai-audio-studio
```

### 2. Configure

```bash
cp infra/env.example infra/.env
```

Edit `infra/.env`. Change only these eight lines — leave everything else:

```bash
POSTGRES_PASSWORD=pick-a-strong-password
N8N_PASSWORD=pick-another-password
OPERATOR_API_TOKEN=long-random-string-minimum-32-chars
WORKER_API_TOKEN=different-long-random-string-here
STUDIO_NAME=Your Studio Name
ENGINEER_NAME=Your Name
ENGINEER_VOICE=Your communication style in 1-2 sentences.
SHARED_PROJECTS_PATH=/Users/your-name/Studio/projects
```

> ⚠️ `OPERATOR_API_TOKEN` and `WORKER_API_TOKEN` must be different from each other. Use a password manager to generate them.

### 3. Start Ollama (model download — takes 10–20 min first time)

```bash
bash scripts/start-ollama.sh
```

Expected output when complete:
```
pulling qwen2.5:14b-instruct... done
pulling qwen2.5:3b... done
```

Verify:
```bash
curl -s http://localhost:11434/api/tags | python3 -m json.tool | grep name
```
You should see both model names.

### 4. Start the stack

```bash
docker compose --env-file infra/.env -f infra/docker-compose.yml up -d
```

### 5. Wait for healthy

```bash
docker compose --env-file infra/.env -f infra/docker-compose.yml ps
```

All services should show `(healthy)` within 2 minutes. If services are still starting, wait 60 seconds and run again.

> ✅ **You should see:** `studio-brain-ui`, `n8n`, `project-state`, `crm-api`, `openclaw`, and others all showing `healthy`.

### 6. Import workflows

```bash
bash scripts/bootstrap_n8n.sh infra/.env
```

Expected: no errors, confirmation that 8 workflows were imported (or already existed).

### 7. Open the dashboard

```
http://localhost:3000
```

> ✅ **You should see:** The Studio Brain UI overview panel with service health indicators.

### 8. Complete the setup questionnaire

Click **Settings** → **Edit Setup** in the dashboard.

Fill in:
- Engineer voice (be specific — this affects draft quality)
- Shared paths (where your audio files live)
- Leave integrations (Gmail, social) for later

Click **Save Settings**.

### 9. Verify Ollama in the concierge

Click **Overview** tab. The Control Room Assistant panel should show "Using Ollama" as the LLM source. If it shows "Fallback mode," Ollama is not reachable — check `curl http://localhost:11434/api/tags`.

### 10. Run a quick smoke test

```bash
curl -s -X POST http://localhost:8130/webhook/lead-intake \
  -H "Content-Type: application/json" \
  -d '{"source":"form","raw_input":"Hi, looking to mix my EP. 8 songs, indie rock. Budget $600-800. Available next month?"}'
```

### 11. Approve your first item

Click **Operations** → check the Approval Queue. Your test lead should appear. Click to review and approve it.

> ✅ **You're done.** The system is working end-to-end.

---

## Optional: DAW Profile

Add audio QC, session prep, revision parsing, mix planning, and delivery packaging:

```bash
docker compose --profile daw --env-file infra/.env -f infra/docker-compose.yml up -d
```

Or stop and restart with both profiles at once:
```bash
docker compose --env-file infra/.env -f infra/docker-compose.yml down
docker compose --profile daw --env-file infra/.env -f infra/docker-compose.yml up -d
```

---

## Optional: LAN Access from Other Devices

To access the dashboard from your phone, iPad, or another Mac on the same network:

1. In `infra/.env`, set: `BIND_HOST=0.0.0.0`
2. Restart: `docker compose --env-file infra/.env -f infra/docker-compose.yml restart`
3. Find your Mac's IP: `ipconfig getifaddr en0`
4. Open `http://<your-mac-ip>:3000` from any device on your network

---

## Reference: Health Check Commands

```bash
curl -sf http://localhost:5678/healthz && echo "n8n OK"
curl -sf http://localhost:8080/health && echo "project-state OK"
curl -sf http://localhost:8090/health && echo "crm-api OK"
curl -sf http://localhost:8100/health && echo "openclaw OK"
curl -sf http://localhost:11434/api/tags >/dev/null && echo "ollama OK"
open http://localhost:3000
```

---

## What's Next

- [Guide: First Run](../guide/01-first-run.md) — complete onboarding walkthrough
- [Guide: Daily Operations](../guide/02-daily-operations.md) — how to use the system each day
- [Setup: Environment Variables](03-environment-variables.md) — every config option explained
- [Guide: Integrations](../guide/12-integrations.md) — Gmail, Instagram, Facebook setup

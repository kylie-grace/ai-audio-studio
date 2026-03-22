# Troubleshooting — Common Problems and Fixes

**Written for:** Everyone

---

## Quick Diagnostic Commands

Run these first when something feels wrong:

```bash
# All services status
docker compose --env-file infra/.env -f infra/docker-compose.yml ps

# Health checks
curl -sf http://localhost:5678/healthz && echo "n8n OK" || echo "n8n FAIL"
curl -sf http://localhost:8080/health && echo "project-state OK" || echo "project-state FAIL"
curl -sf http://localhost:8090/health && echo "crm-api OK" || echo "crm-api FAIL"
curl -sf http://localhost:8100/health && echo "openclaw OK" || echo "openclaw FAIL"
curl -sf http://localhost:11434/api/tags >/dev/null && echo "ollama OK" || echo "ollama FAIL"

# Recent logs from any service
docker compose -f infra/docker-compose.yml logs --tail=50 <service-name>
```

---

## Services Won't Start

### Symptom: `docker compose up` exits with errors

**Check: Is Docker Desktop running?**
```bash
docker info | grep "Server Version"
```
If this fails, open Docker Desktop and wait for it to start.

**Check: Port conflict**
```bash
lsof -i :3000 | head -5
lsof -i :5678 | head -5
lsof -i :8080 | head -5
```
If anything is using these ports, stop it or change the port in `infra/.env`.

**Check: Environment file exists**
```bash
ls -la infra/.env
```
If missing, run `cp infra/env.example infra/.env` and configure it.

---

### Symptom: Services show `starting` or `unhealthy` for more than 3 minutes

**Most common cause: Postgres hasn't finished initializing**

Postgres runs migrations on first start, which takes 30–90 seconds. Check its status:
```bash
docker compose logs --tail=20 db
```

Look for: `database system is ready to accept connections` — if you see this, Postgres is healthy and other services should recover within 30 seconds.

If you see errors in Postgres logs:
- `FATAL: data directory "/var/lib/postgresql/data" has wrong ownership` → volume permissions issue
  ```bash
  docker compose down -v
  docker compose up -d
  ```
  (This resets the database — only safe on a fresh install)

**Check: `POSTGRES_PASSWORD` is not the default**

If `POSTGRES_PASSWORD=changeme_strong_password_here` is still in your `.env`, some services may fail. Change it and run:
```bash
docker compose down -v
docker compose up -d
```

---

## Ollama Problems

### Symptom: Concierge shows "Fallback mode" or LLM timeouts

**Check: Is Ollama running?**
```bash
curl http://localhost:11434/api/tags
```
If this fails, start Ollama:
```bash
bash scripts/start-ollama.sh
```

**Check: Are the models pulled?**
```bash
curl -s http://localhost:11434/api/tags | python3 -m json.tool | grep name
```
You should see `qwen2.5:14b-instruct` and `qwen2.5:3b`. If they're missing, the pull didn't complete — re-run the start script.

**Check: Memory pressure**
```bash
# See how much memory is available
vm_stat | grep "Pages free"
```
If your Mac is very low on memory, Ollama models may fail to load. Close other applications and try again. 16GB is the minimum; 32GB is comfortable for running the 14B model alongside Docker.

### Symptom: Ollama is slow (>30 seconds per response)

On a 16GB Mac with heavy other load, the 14B model runs in CPU-only mode if the GPU is overwhelmed. Options:
- Close other memory-heavy applications
- Switch to a commercial LLM provider: `LLM_PROVIDER=anthropic` or `openai`
- Accept the speed tradeoff for local/private inference

### Symptom: Ollama crashes after a few requests

Usually memory exhaustion. Check:
- `OLLAMA_MAX_LOADED_MODELS=1` is set (prevents two models loading simultaneously)
- `OLLAMA_KEEP_ALIVE=30m` is set (models unload after inactivity)
- No other Ollama instances are running: `ps aux | grep ollama`

---

## Dashboard Problems

### Symptom: Dashboard won't load (`http://localhost:3000` returns nothing)

```bash
docker compose ps studio-brain-ui
```

If the service is running but unreachable:
```bash
docker compose restart studio-brain-ui
```

If the service keeps failing:
```bash
docker compose logs studio-brain-ui
```

Look for build errors (rare — would indicate a corrupted image).

### Symptom: Dashboard loads but shows blank tabs or API errors

Open browser DevTools → Network tab. Look for failing API calls (red entries). The failing URL will tell you which backend service is down.

Common fixes:
- Service restarted mid-session: refresh the browser
- Backend service unhealthy: restart it with `docker compose restart <service-name>`

### Symptom: Settings not saving

Check crm-api health:
```bash
curl http://localhost:8090/health
curl http://localhost:8090/workspace-settings
```

If crm-api is unhealthy, check its logs: `docker compose logs crm-api`

---

## Approval Queue Problems

### Symptom: Submitted a lead/email/stems but nothing appeared in the queue

**Step 1: Did the submission succeed?**

Check the response from the webhook call. A successful submission returns HTTP 200 or 201. An error will be in the response body.

**Step 2: Check the relevant service**
```bash
# For lead intake:
curl http://localhost:8130/health
docker compose logs lead-intake --tail=50

# For inbox triage:
curl http://localhost:8140/health

# For session prep:
curl http://localhost:8150/health
```

**Step 3: Check OpenClaw routing**
```bash
docker compose logs openclaw --tail=50
```
Look for routing decisions. If OpenClaw is receiving the job but not routing it, check that the relevant orchestration rule exists.

**Step 4: Is the module enabled?**

Check Settings → Module Settings. A disabled module returns 423 (not 500) — it won't log an error, it just silently refuses.

### Symptom: Item is in the queue but I can't approve it

Check the job state via the API:
```bash
curl http://localhost:8080/jobs/awaiting-approval
```

If the job shows `awaiting-approval` but the UI isn't showing it, try refreshing the page. If still not visible, check project-state logs:
```bash
docker compose logs project-state --tail=50
```

---

## Worker Problems

### Symptom: Worker shows "offline" in the Operations tab

**Check: Is the worker running?**

For Docker worker:
```bash
docker compose -f infra/docker-compose.worker.yml ps
```

For host-native worker:
```bash
curl http://localhost:8190/health
# or
curl http://<studio-mac-ip>:8190/health
```

**Check: Network reachability**

If the worker is on a different machine:
```bash
# From the control plane, can we reach the worker?
curl http://<worker-ip>:8190/health
```

If this fails, check:
- Both machines are on the same network
- The firewall on the worker machine allows port 8190
- `WORKER_API_BASE_URL` in `.env` matches the actual worker IP and port

**Check: `WORKER_API_BASE_URL` is not loopback for split mode**

If `WORKER_API_BASE_URL=http://localhost:8190` but the worker is on a different machine, the control plane can't reach it. Set the actual LAN IP.

### Symptom: Worker is healthy but tasks aren't being claimed

**Check: Poll interval**

Worker claims tasks on a poll cycle (default: 10 seconds). Wait at least 15 seconds after a task enters the queue.

**Check: Worker capabilities**

```bash
curl http://<worker-ip>:8190/workstation/profile
```

The `capabilities` field shows what task types this worker accepts. If a task type isn't in the capabilities list, the worker won't claim it.

**Check: Dry run mode**

If `STUDIO_WORKER_DRY_RUN_DAW=true`, the worker accepts DAW execution tasks but doesn't actually execute — it generates plans instead. This is correct behavior in dry-run mode.

---

## Gmail Problems

### Symptom: Inbox triage not reading emails

**Check: Label exists**

In Gmail, confirm the label named in `ALLOWED_INBOX_LABELS` actually exists with that exact name (case-sensitive).

**Check: Token is valid**

Gmail OAuth refresh tokens expire after 6 months of non-use or if you revoke access. If triage worked before and stopped:
1. Go to Google Account → Security → Third-party apps
2. Check if "Studio AI Intake" still shows as authorized
3. If not: regenerate the refresh token via the OAuth flow in n8n

**Check: inbox-triage service**
```bash
docker compose logs inbox-triage --tail=50
```

Look for OAuth errors or rate-limiting messages.

### Symptom: Approved drafts not sending

**Check: Gmail Send credentials are set**
```bash
grep GMAIL_SEND infra/.env
```
All three `GMAIL_SEND_*` variables must be non-empty.

**Check: These are different from the intake credentials**
`GMAIL_CLIENT_ID` ≠ `GMAIL_SEND_CLIENT_ID`

If they're the same, the send service has read-only access and can't send.

---

## QC Always Failing

### Symptom: LUFS consistently fails

Check your QC thresholds in Settings → Module Settings → Audio QC. If your target is `-14 LUFS` but your renders are at `-9 LUFS` (common for mastered-for-radio content), either:
- Adjust the LUFS target in module settings to match your actual delivery intent
- Change your mastering target to match streaming norms

### Symptom: True peak always fails

Check your limiter ceiling in your DAW. It should be set to -1.0 dBTP or below. Many stock limiters default to 0 dBFS — this will cause inter-sample peaks above the ceiling.

### Symptom: Phase check always fails

You likely have stereo-widening on bass frequencies. Check:
- Any stereo enhancement plugin on your master bus
- Any wide stereo reverb on bass or kick
- Mid/Side processing configuration

Use a correlation meter on your master bus while the session is playing to find the phase problem source.

---

## After Restart: Bringing the Stack Back Up

If you've restarted your Mac or stopped Docker:

```bash
# Start Ollama first
bash scripts/start-ollama.sh

# Then start the stack
docker compose --env-file infra/.env -f infra/docker-compose.yml up -d

# If using DAW profile:
docker compose --profile daw --env-file infra/.env -f infra/docker-compose.yml up -d

# If using local worker:
docker compose --profile local-worker --env-file infra/.env -f infra/docker-compose.yml up -d

# Wait for healthy
docker compose ps
```

All state (approvals, audit log, projects, settings) is persisted in the Postgres database and will be available immediately after restart.

---

## Hard Reset (Last Resort)

> ⚠️ **This destroys all data.** Only use for development or when starting completely fresh.

```bash
docker compose --env-file infra/.env -f infra/docker-compose.yml down -v
docker compose --env-file infra/.env -f infra/docker-compose.yml up -d
bash scripts/bootstrap_n8n.sh infra/.env
```

After a hard reset, you'll need to re-complete the setup questionnaire.

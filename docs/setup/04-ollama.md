# Ollama — Local LLM Setup

**Written for:** Studio Owner, Developer Contributor

---

## Why Ollama Runs Outside Docker

Ollama runs natively on macOS — not in a Docker container. This is intentional.

**The reason:** Docker Desktop on Apple Silicon cannot pass through the Metal GPU. Any LLM running inside Docker runs on CPU only, which is 10–40x slower than GPU-accelerated inference on Apple Silicon. A query that takes 3 seconds on native Metal takes 60–120 seconds on Docker CPU.

Additionally, the 14B planner model requires ~8.5 GB of memory to load. Running it inside Docker alongside the rest of the Docker stack on a 16 GB machine risks out-of-memory crashes.

The solution: run Ollama natively, and have Docker containers reach it via `host.docker.internal:11434`.

---

## Installation

If Ollama isn't installed:

1. Download from [ollama.ai](https://ollama.ai)
2. Open the downloaded package and install
3. Ollama installs to `/usr/local/bin/ollama`

Verify:
```bash
which ollama
ollama --version
```

---

## Starting Ollama and Pulling Models

```bash
bash scripts/start-ollama.sh
```

This script:
1. Sets `OLLAMA_MAX_LOADED_MODELS=1` (prevents two models loading simultaneously on 16 GB machines)
2. Sets `OLLAMA_KEEP_ALIVE=30m` (models unload after 30 minutes of inactivity)
3. Starts the Ollama server if it isn't running
4. Pulls `qwen2.5:14b-instruct` — the planner model (~8.5 GB)
5. Pulls `qwen2.5:3b` — the classifier model (~2 GB)

First run requires downloading the models. Budget 10–30 minutes depending on your connection.

Verify both models are available:
```bash
curl -s http://localhost:11434/api/tags | python3 -c "import sys,json; [print(m['name']) for m in json.load(sys.stdin)['models']]"
```

---

## Autostart with launchd

For Ollama to start automatically when you log in:

```bash
cp scripts/com.ai-audio-studio.ollama.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.ai-audio-studio.ollama.plist
```

To verify it's loaded:
```bash
launchctl list | grep ollama
```

To stop the launchd-managed Ollama:
```bash
launchctl unload ~/Library/LaunchAgents/com.ai-audio-studio.ollama.plist
```

To start it manually without launchd:
```bash
OLLAMA_MAX_LOADED_MODELS=1 OLLAMA_KEEP_ALIVE=30m ollama serve
```

---

## The Two Models

### qwen2.5:14b-instruct — Planner/Concierge

Used by:
- The Control Room Assistant (concierge chat)
- Lead intake drafting
- Inbox triage drafting
- Social content generation
- Revision parsing
- Mix planning

**Size:** ~8.5 GB VRAM
**Speed:** 5–15 seconds per response on Apple Silicon (M1/M2 Pro, 16 GB)
**Faster on:** M2 Max/Ultra, M3 Pro/Max/Ultra, or machines with 32+ GB unified memory

### qwen2.5:3b — Classifier

Used by:
- Email classification routing
- Lead urgency/fit scoring
- Internal routing decisions that don't need full language understanding

**Size:** ~2 GB VRAM
**Speed:** 1–3 seconds per response
**Purpose:** Fast routing without loading the full planner model for every classification

### OLLAMA_MAX_LOADED_MODELS=1

This setting prevents both models from being loaded simultaneously. On a 16 GB machine, having both models in memory at once risks leaving insufficient RAM for the rest of the Docker stack. The `1` setting means Ollama loads the requested model and unloads the previous one automatically.

---

## Memory Management

### OLLAMA_KEEP_ALIVE=30m

After 30 minutes without a request, Ollama unloads the model from memory. This frees up ~8.5 GB for other applications when the system is idle.

When the next request comes in, Ollama reloads the model — this adds 3–8 seconds of load time to the first response. For interactive use, this is imperceptible. For batch processing, you may want to increase the keep-alive.

Options:
```bash
OLLAMA_KEEP_ALIVE=1h    # Keep loaded for 1 hour
OLLAMA_KEEP_ALIVE=-1    # Keep loaded forever (uses max memory, not recommended on 16 GB)
OLLAMA_KEEP_ALIVE=5m    # Unload after 5 minutes (more aggressive memory recovery)
```

### Checking Current Memory Usage

```bash
# See Ollama's memory footprint
ps aux | grep ollama

# See what models are currently loaded
curl http://localhost:11434/api/ps
```

---

## Commercial LLM Fallback

If local inference is too slow, you can switch to a commercial API.

### Using Anthropic (Claude)

```bash
# In infra/.env:
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-your-key-here
PLANNER_MODEL=claude-sonnet-4-6
CLASSIFIER_MODEL=claude-haiku-4-5-20251001
```

Restart affected services:
```bash
docker compose restart openclaw lead-intake inbox-triage content-pipeline revision-parser mix-planner
```

### Using OpenAI (GPT-4o)

```bash
# In infra/.env:
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-your-key-here
PLANNER_MODEL=gpt-4o
CLASSIFIER_MODEL=gpt-4o-mini
```

Same restart.

### Switching Back to Ollama

```bash
LLM_PROVIDER=ollama
PLANNER_MODEL=qwen2.5:14b-instruct
CLASSIFIER_MODEL=qwen2.5:3b
```

Restart the same services.

> ℹ️ **Commercial API key gap surface.** If you set `LLM_PROVIDER=anthropic` but leave `ANTHROPIC_API_KEY` empty, the dashboard will surface a warning banner in the relevant tabs. The system won't silently fail — it will tell you the key is missing.

### When to Use Commercial

- Development or testing where you want fast responses
- If your Mac is under heavy load from a large DAW session
- When draft quality needs improvement and local models aren't cutting it
- Temporary fallback during Ollama maintenance

### Privacy Consideration

With local Ollama: **no data leaves your machine.** Client names, project details, email content, and revision notes are processed locally.

With commercial providers: **text content is sent to Anthropic's or OpenAI's API.** Review their data handling policies before enabling commercial mode for client work.

---

## Troubleshooting

**Ollama not responding:**
```bash
curl http://localhost:11434/api/tags
# If fails: start Ollama
bash scripts/start-ollama.sh
```

**Model not found:**
```bash
ollama pull qwen2.5:14b-instruct
ollama pull qwen2.5:3b
```

**Memory crash / Mac becomes unresponsive:**
- Ollama may be loading both models simultaneously
- Check and set `OLLAMA_MAX_LOADED_MODELS=1`
- Also set `OLLAMA_KEEP_ALIVE=30m` to auto-unload on idle
- If it happens repeatedly, reduce to the 3B model only by setting both `PLANNER_MODEL=qwen2.5:3b` and `CLASSIFIER_MODEL=qwen2.5:3b` (slower reasoning, lower memory)

**Can't pull models (download fails):**
- Check disk space: `df -h ~` (need ~15 GB for both models)
- Try pulling manually with progress: `ollama pull qwen2.5:14b-instruct`
- If network issues: try again from a different network or VPN

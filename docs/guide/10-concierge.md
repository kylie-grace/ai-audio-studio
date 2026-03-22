# The Control Room Assistant (Concierge)

**Written for:** Studio Owner/Operator, Guest Engineer

---

## What It Is

The Control Room Assistant is an LLM-backed chat interface built into the Overview tab. It's not a general-purpose chatbot — it's connected to your live stack context, which means it knows what's actually happening in your system right now.

When you ask it a question, it reads your current:
- Approval queue (count, types, urgency)
- Worker status (healthy, offline, drained)
- Service health state
- Active alerts
- Workspace settings (studio name, engineer name, paths, integrations)
- Orchestration rules
- Recent project activity

This makes it useful for quick operational questions without navigating through multiple tabs.

---

## What Powers It

By default: **Ollama running natively on your Mac** — specifically `qwen2.5:14b-instruct`. This model runs locally, so your data never leaves your machine.

Optionally: **Anthropic (Claude) or OpenAI (GPT-4o)** — if you've set `LLM_PROVIDER=anthropic` or `LLM_PROVIDER=openai` and configured the API key. Commercial providers tend to produce higher-quality responses but require external API calls.

The concierge will tell you which mode it's running in. Look for the status indicator showing "Using Ollama" or the provider name. If you see **"Fallback mode"** — Ollama is unreachable and the concierge is providing static guidance rather than context-aware answers.

---

## What It Knows

The concierge has access to:
- Live approval queue state (count, types, waiting time)
- Worker registration and health status
- All service health indicators
- Your workspace settings (paths, identity, integrations)
- Current alert state
- n8n bootstrap status
- Project and client activity

It does **not** have access to:
- The content of audio files
- Email thread content (just classifications and counts)
- Social post analytics
- Anything outside the stack's database and health endpoints

---

## What It Can Do

The concierge can initiate a small set of safe actions on your behalf:

- **Navigate to tabs** — "Take me to Operations" → navigates the UI
- **Run workstation smoke test** — "Run the dry-run smoke" → triggers the validation
- **Open Settings** — "I want to set up Gmail" → navigates to the relevant settings section

All other actions still require you to click through the normal UI. The concierge cannot approve items, modify settings directly, execute DAW operations, or send communications on your behalf.

---

## What It Cannot Do

- Send emails or take any outbound action
- Approve or reject queue items
- Modify your settings or environment variables
- Execute DAW scripts
- Access external systems (it can't check your Gmail directly)
- Do anything that requires elevated system access

If you ask the concierge to do something it can't do, it will tell you what the correct path is instead.

---

## Good Questions to Ask

**Morning status:**
> "What needs my attention right now?"
> "How many approvals are pending?"
> "Is everything healthy?"

**Operational questions:**
> "Why is the worker showing offline?"
> "What's the current alert I'm seeing about?"
> "Is Gmail intake configured?"
> "What's the status of the n8n workflows?"

**Setup guidance:**
> "Walk me through setting up Gmail"
> "How do I enable the DAW profile?"
> "What do I need to do to set up a remote worker?"
> "How do I add a custom orchestration rule?"

**Technical explanations:**
> "What does -14 LUFS mean?"
> "Why did the QC report fail?"
> "What's the difference between the planner model and the classifier model?"

**Workflow questions:**
> "How does a lead go from arriving to me sending a reply?"
> "What happens when I approve a session prep?"
> "What is dry-run mode?"

---

## When the Concierge Is Wrong

The concierge is honest about uncertainty, but it can be wrong. A few things to know:

- **It interprets context, not facts.** If you ask "what happened with the River James project" and the concierge doesn't have that specific project record, it will say so rather than make something up.

- **It can misread stack state.** If services are mid-restart or the database is returning partial data, the concierge may describe a state that's about to change.

- **For critical decisions, verify in the UI.** If the concierge says "no approvals pending" and that seems wrong, check the Operations tab directly. The concierge reads live state, but the UI is always authoritative.

---

## Fallback Mode

When Ollama is unreachable (not running, model not loaded, timeout), the concierge enters fallback mode.

In fallback mode:
- The status indicator shows "Fallback mode" (not "Using Ollama")
- The concierge provides static guidance based on known operational patterns
- It cannot read live stack context
- Answers are general ("here's how to check X") rather than specific ("you have 3 pending approvals")

To restore full concierge functionality:
```bash
bash scripts/start-ollama.sh
```

Or check if Ollama is running:
```bash
curl http://localhost:11434/api/tags
```

---

## Response Time

Ollama response time depends on your machine. On Apple Silicon with 16GB RAM:
- `qwen2.5:3b` (classifier): ~1–3 seconds
- `qwen2.5:14b-instruct` (planner/concierge): ~5–15 seconds for moderate queries

The concierge uses the planner model. If responses feel slow, it's normal — the 14B model is doing substantial work. Timeout is set by `CONCIERGE_LLM_TIMEOUT_SECONDS` (default: 120).

If you need faster responses:
- Switch `LLM_PROVIDER=anthropic` with Claude — API responses are typically 2–5 seconds
- Or accept the local-first tradeoff for privacy and no API costs

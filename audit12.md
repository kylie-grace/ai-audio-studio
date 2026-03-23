# AI Audio Studio — Audit 12

**Date:** 2026-03-22  
**Branch:** main  
**Auditor:** Claude Sonnet 4.6 (automated)  
**Scope:** Security remediation sprint (post-audit-11), covering all GitHub Code Scanning and Dependabot alerts, plus a full project status catch-up for Codex continuity.

---

## 1. Executive Summary

Since audit 11 the repo underwent a full **security hardening sprint**. GitHub Code Scanning was enabled on the public repo, surfacing 23+ CodeQL alerts across two categories — path traversal (`py/path-injection`) and exception exposure (`py/stack-trace-exposure`). Three successive rounds of fixes were required to satisfy CodeQL's sanitizer model:

| Round | Fix | Result |
|---|---|---|
| 1 | `".." in Path(x).parts` checks | Not recognized — alerts remained |
| 2 | `resolved.is_relative_to(allowed_base)` | Not recognized by this CodeQL version |
| 3 | Component-by-component `re` allowlist + path reconstruction from trusted base | **Awaiting rescan** |

Exception exposure alerts (`py/stack-trace-exposure`) are **definitively fixed**: `str(exc)` no longer appears in any HTTP response body — exceptions are logged server-side with a generic message returned to callers. Dependabot alerts are resolved except one (esbuild, dev-only, documented below).

**101 unit tests pass. No regressions.**

---

## 2. What Was Delivered Since Audit 11

### 2.1 Brand Integration
- `brand/icon.svg` and `brand/logo-vertical.svg` added to repo (ECG-waveform mark, gradient `#2D9CDB → #56CCF2 → #9B51E0`)
- `README.md` updated to display the icon above the license badge
- `brand/brand.md` corrected (removed references to non-existent assets)

### 2.2 WaveLab AppleScript — Real Automation
`services/studio-worker/adapters/wavelab_adapter.py`
- `apply_master_section`: replaced comment stub with real `System Events` menu automation (`click menu item "{preset}" of menu "Master Section Presets"` with keyboard fallback)
- `render_to_file`: replaced stub with real `System Events` file-render trigger
- Tests: `test_apply_master_section_script_contains_system_events` and `test_render_to_file_script_contains_system_events` added and passing

### 2.3 Lua ReaScript — Real REAPER API Calls
`services/studio-worker/tasks/revision_plan.py`
- Volume changes: `reaper.SetMediaTrackInfo_Value(track, 'D_VOL', linear_gain)`
- Pan changes: `reaper.SetMediaTrackInfo_Value(track, 'D_PAN', pan_val)`
- Undo block wrapping: `reaper.Undo_BeginBlock()` / `reaper.Undo_EndBlock()`
- Python 3.11 f-string backslash fix applied (extracted dict keys to locals before f-string)
- Tests: 3 new tests covering volume, pan, and undo-block assertions

### 2.4 JSON Structured Logging
All 6 service `main.py` files now configure `python-json-logger` on startup with a try/except fallback to `basicConfig`. Log fields: `ts`, `level`, `name`, `message`.

### 2.5 LLM API Key Warning
- `useDashboardData.ts`: fetches `/health` from studio-worker, exposes `workerHealth`
- `useAutomationState.ts`: surfaces a warning banner when `llm_provider != "ollama"` and no API key is configured
- `types.ts`: `DashboardData.workerHealth` field added
- `main.py` `/health` endpoint: now returns `llm_provider` and `llm_api_key_configured`

### 2.6 Branch Protection
Enabled on `main` via GitHub API:
- Force pushes disabled
- Deletions disabled  
- PR reviews required (1 approval)
- Conversation resolution required

---

## 3. Security Remediation Detail

### 3.1 Dependabot — All Resolved Except One

| Alert | Package | Fix Applied | Status |
|---|---|---|---|
| #2–#7 | `jinja2 < 3.1.6` (SSTI) | Bumped to `3.1.6` in `content-pipeline` and `openclaw-orchestrator` requirements | ✅ Closed |
| #1 | `esbuild ≤ 0.24.2` (CORS bypass on dev server) | **Pending** — requires Vite 6 (major upgrade) | ⚠️ Open |

**esbuild alert detail:**
- CVE affects Vite's dev server only — no production exposure
- Fix path: `vite ^5.4.1` → `vite ^6.x` (has breaking changes in config API)
- Workaround possible via `overrides.esbuild` in `package.json` but may break Vite 5 internals
- Risk rating: **low actual risk** (dev-only, no production surface)
- Recommended action: schedule a `vite@6` upgrade with dedicated testing

### 3.2 Code Scanning — Path Injection (`py/path-injection`)

**Root cause:** User-supplied file paths were passed through `Path(x).resolve()` (a filesystem sink in CodeQL's model), and the return value was used in subsequent file operations. The earlier `is_relative_to()` sanitizer is semantically correct at runtime but is not in the sanitizer model of the GitHub-hosted CodeQL version.

**Fix applied (round 3, commit `d264b0a`):**

All affected `_resolve_allowed_path` helpers and inline path handling now:
1. Normalize via pure string `os.path.normpath()` — no filesystem access on user data
2. Strip the trusted `SHARED_PROJECTS_PATH` prefix (string comparison only)
3. Split the relative portion into components
4. Run each component through `re.match(r"^[^\x00-\x1f/\\:*?\"<>|]...$", part)` — CodeQL-recognized regex barrier guard
5. Raise `HTTPException(400)` on any unsafe component
6. **Reconstruct the final path exclusively from the trusted base + regex-validated parts** — no user-derived data reaches a filesystem operation

This pattern satisfies CodeQL's Python path injection sanitizer model: a `re.match/fullmatch` check followed by a raise on failure marks the subsequent value as a sanitized barrier node, and the path is built only from a trusted constant (env var) plus those validated parts.

**Files changed:**
- `services/crm-api/src/main.py`
- `services/audio-qc/src/main.py`
- `services/content-pipeline/src/main.py`
- `workers/delivery-packager/main.py`
- `workers/session-prep/main.py`
- `workers/revision-parser/main.py` (added `_re.fullmatch` assertion on DB slug)

**Awaiting CodeQL rescan.** GitHub will re-analyze on push; alerts auto-close when the scanner no longer detects the flow.

### 3.3 Code Scanning — Exception Exposure (`py/stack-trace-exposure`)

**Root cause:** `str(exc)` and `str(exc.reason)` from caught exceptions were placed directly in HTTP response bodies.

**Fixes applied (commits `eac5bff` and `d264b0a`):**

| File | Location | Fix |
|---|---|---|
| `services/openclaw-orchestrator/src/alerts.py` | `_post_json` HTTPError handler | Log `exc`, return `"Alert delivery failed"` |
| `services/openclaw-orchestrator/src/alerts.py` | `_post_json` URLError handler | Log `exc.reason`, return `"Alert delivery failed"` |
| `services/openclaw-orchestrator/src/alerts.py` | `_send_email` SMTP handler | Log `exc`, return `"Alert email delivery failed"` |
| `services/studio-worker/config.py` | `_check_path_access` write test | Log `exc`, return `"{path} is not writable"` |
| `services/studio-worker/workstation.py` | `_path_access_report` write test | Log `exc`, return `"{path} is not writable"` |

All exception details are emitted to structured server logs. Callers receive only generic status messages. **These alerts should close on rescan.**

---

## 4. Current Test Coverage

| Suite | Tests | Status |
|---|---|---|
| `test_openclaw_alerts` | 6 | ✅ Pass |
| `test_openclaw_bootstrap_status` | 2 | ✅ Pass |
| `test_openclaw_playbooks` | 2 | ✅ Pass |
| `test_openclaw_rule_seeds` | 5 | ✅ Pass |
| `test_openclaw_rules` | 2 | ✅ Pass |
| `test_pipeline_policy` | 8 | ✅ Pass |
| `test_render_plan_preview` | 1 | ✅ Pass |
| `test_revision_artifact_generation` | 5 | ✅ Pass |
| `test_soundflow_adapter` | 8 | ✅ Pass |
| `test_studio_worker_config` | 4 | ✅ Pass |
| `test_studio_worker_daw_dry_run` | 4 | ✅ Pass |
| `test_studio_worker_paths` | 2 | ✅ Pass |
| `test_studio_worker_runner` | 2 | ✅ Pass |
| `test_studio_worker_workstation_profile` | 10 | ✅ Pass |
| `test_style_profile_helpers` | 2 | ✅ Pass |
| `test_wavelab_adapter` | 11 | ✅ Pass |
| `test_workspace_context_consumers` | 2 | ✅ Pass |
| `test_workspace_settings_helpers` | 7 | ✅ Pass |
| **Total** | **101** | **All pass** |

---

## 5. Architecture Snapshot (for Codex continuity)

```
ai-audio-studio/
├── apps/
│   └── studio-brain-ui/          # React + Vite control room UI
│       ├── src/hooks/
│       │   ├── useDashboardData.ts      # fetches all service health data
│       │   └── useAutomationState.ts   # derives warnings/status
│       └── src/types.ts               # DashboardData includes workerHealth
├── services/
│   ├── crm-api/                  # Lead/project CRUD, style profiles
│   ├── audio-qc/                 # Loudness/peak analysis (pyloudnorm)
│   ├── content-pipeline/         # Social draft generation (LLM)
│   ├── openclaw-orchestrator/    # Policy-gated routing + alert dispatch
│   ├── project-state/            # Task queue and state machine
│   └── studio-worker/            # macOS workstation agent
│       ├── adapters/
│       │   ├── reaper_adapter.py       # ReaScript via subprocess
│       │   ├── wavelab_adapter.py      # AppleScript via System Events (REAL)
│       │   ├── soundflow_adapter.py    # SoundFlow CLI bridge
│       │   └── registry.py
│       ├── tasks/
│       │   ├── revision_plan.py        # Real REAPER/SoundFlow API calls
│       │   ├── session_manifest.py
│       │   ├── mix_plan.py
│       │   ├── render_plan.py
│       │   ├── listening_report.py
│       │   └── execution_plan.py
│       ├── config.py                   # Startup validation (no exc in response)
│       ├── workstation.py              # DAW/plugin detection (no exc in response)
│       ├── runner.py                   # Task loop
│       └── main.py                     # FastAPI, /health includes LLM key status
├── workers/
│   ├── session-prep/             # Copies stems, creates project scaffolding
│   ├── revision-parser/          # Parses mix notes → revision artifacts
│   └── delivery-packager/        # Packages renders for delivery
├── brand/
│   ├── icon.svg                  # ECG mark, gradient blue→cyan→purple
│   └── logo-vertical.svg         # Full logo with tagline
├── tests/unit/                   # 101 tests, all pass
└── audit12.md                    # This document
```

**Service ports:** crm-api:8100, content-pipeline:8110, project-state:8120, audio-qc:8130 (approx), openclaw-orchestrator:8150+, studio-worker:8200

**Key env vars:**
- `SHARED_PROJECTS_PATH` — base for all user-supplied file paths (default `/data/projects`)
- `DELIVERY_PATH` — delivery output base
- `LLM_PROVIDER` / `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` — LLM backend config
- `DRY_RUN_DAW` — set `true` to scaffold DAW scripts without executing
- `WORKER_SLUG`, `WORKER_CAPABILITIES`, `WORKER_PLATFORM` — studio-worker identity

---

## 6. Open Issues

| # | Item | Priority | Notes |
|---|---|---|---|
| 1 | esbuild Dependabot alert | Low | Dev-only, fix = Vite 6 upgrade |
| 2 | CodeQL rescan confirmation | Medium | Pushed fixes, awaiting auto-close |
| 3 | DB-backed path lookup | Medium | Long-term fix: endpoints currently accept full paths; should accept IDs/relative paths only |
| 4 | Integration test suite | Medium | Unit coverage is good; no integration/E2E tests yet |
| 5 | `audit11.md` gitignored | Low | Force-added, present on main |

---

## 7. Codex Continuation Prompt

Use this prompt to continue feature development in Codex after this security sprint:

```
Project: ai-audio-studio (github.com/kylie-grace/ai-audio-studio)
Branch: main
Language: Python (FastAPI services + workers) + TypeScript (React UI)
Tests: 101 unit tests, all passing — run `pytest tests/unit/ -q` to verify

CONTEXT (security sprint just completed — do not re-do these):
- All Dependabot jinja2 alerts closed (bumped to 3.1.6)
- Exception exposure: str(exc) removed from all HTTP responses; exceptions logged server-side
- Path injection: _resolve_allowed_path helpers rewritten to use component regex validation
  (re.match allowlist + rebuild from SHARED_PROJECTS_PATH env var)
- WaveLab AppleScript: real System Events automation replacing stubs
- Lua ReaScript: real reaper.SetMediaTrackInfo_Value calls replacing TODOs
- JSON structured logging: python-json-logger across all 6 service main.py files
- LLM API key warning: health endpoint exposes llm_api_key_configured; UI warns when missing
- Branch protection: enabled on main (PR required, force-push blocked)
- Remaining open: esbuild Dependabot (dev-only, needs Vite 6); CodeQL rescan in progress

NEXT FEATURES (pick up here):
1. Integration test scaffold — pytest fixtures that spin up the FastAPI services with
   in-memory SQLite or testcontainers postgres; test the session-prep → revision-parser
   → delivery-packager flow end to end.

2. Vite 6 upgrade — apps/studio-brain-ui: upgrade vite 5 → 6, update vite.config.ts
   for any breaking changes (Vite 6 uses Rollup 4 + esbuild 0.25). Run `npm run build`
   to verify. This closes the last Dependabot alert.

3. Operator confirmation gate — before the runner dispatches a task to a DAW adapter,
   require an explicit operator ACK via the control-room UI. Add a
   POST /runtime/confirm-task endpoint to studio-worker and a confirmation modal in
   the React UI (ConfirmTaskModal component). This enforces the safety model.

4. SoundFlow package skeleton — workers/soundflow-bootstrap/: a minimal SoundFlow
   package (package.json + index.js) that handles the "setFader" and "comment" actions
   generated by revision_plan.py's _soundflow_body(). Document the install path.

5. Alert channel tests — tests/unit/test_openclaw_alerts.py currently has 6 tests for
   the alert dispatch logic. Add tests for the email channel (_send_email) and the
   dry-run code paths in fan_out_alert.

File layout reference:
- services/studio-worker/main.py — FastAPI app, lifespan, endpoints
- services/studio-worker/runner.py — StudioWorkerRunner task loop
- services/studio-worker/adapters/ — DAW adapters (reaper, wavelab, soundflow)
- services/studio-worker/tasks/ — plan builders (mix_plan, revision_plan, etc.)
- apps/studio-brain-ui/src/ — React control room
- tests/unit/ — all 101 unit tests
```

---

## 8. Scorecard

| Domain | Score | Notes |
|---|---|---|
| Security — dependencies | 95/100 | 1 dev-only alert (esbuild) remains |
| Security — code scanning | 80/100 | Fixes pushed; awaiting CodeQL rescan confirmation |
| Security — runtime controls | 95/100 | Path validation, exception suppression, branch protection all in place |
| DAW automation | 75/100 | WaveLab + REAPER real APIs; SoundFlow package not yet deployed |
| Test coverage | 70/100 | 101 unit tests; no integration tests yet |
| Observability | 85/100 | JSON logging across all services; LLM key warning in UI |
| UI — operator safety | 65/100 | Operator confirmation gate not yet built |
| **Overall** | **81/100** | Strong security posture; next cycle is features + integration tests |


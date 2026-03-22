"""OpenClaw Orchestrator — policy-enforced routing to workers."""

from __future__ import annotations

import json
import os
import re
from contextlib import asynccontextmanager
from urllib.error import URLError
from urllib.request import Request, urlopen

import asyncpg
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from .alerts import alert_config, build_alert_event, send_alert_event
from .bootstrap_status import bootstrap_status
from .policy import BLOCKLIST, check_permission
from .playbooks import default_playbooks
from .rules import (
    default_rule_packs,
    default_orchestration_rules,
    decode_jsonb,
    matches_conditions,
    serialize_rule,
    starter_pack_application,
    starter_pack_by_slug,
    starter_packs,
)

WORKER_URLS = {
    "lead-intake": "http://lead-intake:8130/webhook/lead-intake",
    "inbox-triage": "http://inbox-triage:8140/webhook/inbox-triage",
    "social-drafting": "http://content-pipeline:8110/draft-social",
    "session-prep": "http://session-prep:8150/prepare-session",
    "revision-parser": "http://revision-parser:8160/parse-revisions",
    "delivery-packager": "http://delivery-packager:8170/package-delivery",
    "mix-planner": "http://mix-planner:8180/mix-plan",
}
MODULE_KEY_ALIASES = {
    "lead-intake": "lead_intake",
    "inbox-triage": "inbox_triage",
    "social-drafting": "content_pipeline",
    "content-pipeline": "content_pipeline",
    "session-prep": "session_prep",
    "revision-parser": "revision_parser",
    "delivery-packager": "delivery_packager",
    "mix-planner": "mix_planner",
    "audio-qc": "audio_qc",
}

CRM_API_URL = os.environ.get("CRM_API_URL", "http://crm-api:8090")
PROJECT_STATE_URL = os.environ.get("PROJECT_STATE_URL", "http://project-state:8080")
OLLAMA_BASE_URL = os.environ.get("OLLAMA_BASE_URL", "http://ollama:11434")
PLANNER_MODEL = os.environ.get("PLANNER_MODEL", "qwen2.5:14b-instruct")
CLASSIFIER_MODEL = os.environ.get("CLASSIFIER_MODEL", "qwen2.5:3b")
CONCIERGE_LLM_TIMEOUT_SECONDS = float(os.environ.get("CONCIERGE_LLM_TIMEOUT_SECONDS", "8"))

_pool: asyncpg.Pool | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _pool
    _pool = await asyncpg.create_pool(os.environ["POSTGRES_DSN"], min_size=1, max_size=5)
    await seed_default_orchestration_rules(_pool)
    yield
    if _pool is not None:
        await _pool.close()


app = FastAPI(title="OpenClaw Orchestrator", lifespan=lifespan)


async def get_pool() -> asyncpg.Pool:
    if _pool is None:
        raise RuntimeError("DB pool not initialized")
    return _pool


async def seed_default_orchestration_rules(pool: asyncpg.Pool) -> None:
    style_profile = await pool.fetchrow(
        "SELECT id FROM style_profiles WHERE name=$1 ORDER BY created_at ASC LIMIT 1",
        "Default Studio Tone",
    )
    rules = default_orchestration_rules(str(style_profile["id"]) if style_profile else None)
    for rule in rules:
        await pool.execute(
            """INSERT INTO orchestration_rules
               (slug, name, trigger_module, trigger_action, target_module, required_tier,
                approval_required, enabled, style_profile_id, conditions)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)
               ON CONFLICT (slug) DO UPDATE SET
                 name=EXCLUDED.name,
                 trigger_module=EXCLUDED.trigger_module,
                 trigger_action=EXCLUDED.trigger_action,
                 target_module=EXCLUDED.target_module,
                 required_tier=EXCLUDED.required_tier,
                 approval_required=EXCLUDED.approval_required,
                 enabled=EXCLUDED.enabled,
                 style_profile_id=EXCLUDED.style_profile_id,
                 conditions=EXCLUDED.conditions,
                 updated_at=now()""",
            rule["slug"],
            rule["name"],
            rule["trigger_module"],
            rule["trigger_action"],
            rule["target_module"],
            rule["required_tier"],
            rule["approval_required"],
            rule["enabled"],
            rule["style_profile_id"],
            json.dumps(rule["conditions"]),
        )


class PolicyCheckBody(BaseModel):
    action: str
    tier: int


class DispatchBody(BaseModel):
    module: str
    action: str
    tier: int = 3
    project_id: str | None = None
    trigger_payload: dict = {}
    approval_required: bool = True


class CreateRuleBody(BaseModel):
    slug: str
    name: str
    trigger_module: str
    trigger_action: str
    target_module: str
    required_tier: int = 3
    approval_required: bool = True
    enabled: bool = True
    style_profile_id: str | None = None
    conditions: dict = {}


class TriggerDispatchBody(BaseModel):
    trigger_module: str
    trigger_action: str
    project_id: str | None = None
    context: dict = {}


class AlertTestBody(BaseModel):
    slug: str = "operator-test"
    severity: str = "warn"
    detail: str = "Manual test alert from Studio Brain."
    summary: str | None = None
    channels: list[str] | None = None
    dry_run: bool = False
    context: dict = {}


class ApplyStarterPackBody(BaseModel):
    exclusive: bool = True


class ConciergeBody(BaseModel):
    message: str


class ConciergeResponse(BaseModel):
    status: str
    mode: str
    reply: str
    actions: list[dict[str, str]]
    context_summary: dict


def fetch_json(url: str) -> dict:
    try:
        with urlopen(url, timeout=5) as response:
            return json.loads(response.read().decode("utf-8"))
    except URLError as exc:
        raise HTTPException(status_code=502, detail=f"Unable to reach upstream dependency: {exc.reason}") from exc


def fetch_optional_json(url: str) -> dict | list | None:
    try:
        with urlopen(url, timeout=5) as response:
            return json.loads(response.read().decode("utf-8"))
    except (URLError, ValueError, json.JSONDecodeError):
        return None


def load_workspace_settings() -> dict:
    payload = fetch_json(f"{CRM_API_URL}/workspace-settings")
    return payload if isinstance(payload, dict) else {}


def module_settings_for(module_name: str) -> dict:
    settings = load_workspace_settings()
    module_key = MODULE_KEY_ALIASES.get(module_name, module_name.replace("-", "_"))
    module_settings = settings.get("module_settings") or {}
    value = module_settings.get(module_key) or {}
    return value if isinstance(value, dict) else {}


def assert_module_enabled(module_name: str) -> dict:
    module_key = MODULE_KEY_ALIASES.get(module_name, module_name.replace("-", "_"))
    module_settings = module_settings_for(module_name)
    if not module_settings.get("enabled", True):
        raise HTTPException(status_code=423, detail=f"{module_key} disabled in workspace settings")
    return module_settings


def load_runtime_alerts() -> dict:
    payload = fetch_json(f"{PROJECT_STATE_URL}/alerts/summary")
    return payload if isinstance(payload, dict) else {}


def _extract_json_object(text: str) -> dict | None:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        lines = cleaned.splitlines()
        inner = lines[1:] if len(lines) > 1 else lines
        if inner and inner[-1].strip() == "```":
            inner = inner[:-1]
        cleaned = "\n".join(inner).strip()
    try:
        parsed = json.loads(cleaned)
        return parsed if isinstance(parsed, dict) else None
    except json.JSONDecodeError:
        pass
    match = re.search(r"\{.*\}", cleaned, re.DOTALL)
    if not match:
        return None
    try:
        parsed = json.loads(match.group())
        return parsed if isinstance(parsed, dict) else None
    except json.JSONDecodeError:
        return None


def _ollama_generate(prompt: str) -> str:
    last_error: Exception | None = None
    for model in [PLANNER_MODEL, CLASSIFIER_MODEL]:
        request = Request(
            f"{OLLAMA_BASE_URL}/api/generate",
            data=json.dumps({"model": model, "prompt": prompt, "stream": False}).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urlopen(request, timeout=CONCIERGE_LLM_TIMEOUT_SECONDS) as response:
                payload = json.loads(response.read().decode("utf-8"))
            text = str(payload.get("response") or "").strip()
            if text:
                return text
        except Exception as exc:
            last_error = exc
            continue
    if last_error is not None:
        raise last_error
    return ""


def build_concierge_context() -> dict:
    workspace = fetch_optional_json(f"{CRM_API_URL}/workspace-settings/status")
    runtime_alerts = fetch_optional_json(f"{PROJECT_STATE_URL}/alerts/summary")
    workers = fetch_optional_json(f"{PROJECT_STATE_URL}/workers/") or []
    approvals = fetch_optional_json(f"{PROJECT_STATE_URL}/approval-queue/") or []
    projects = fetch_optional_json(f"{CRM_API_URL}/projects") or []
    bootstrap = bootstrap_status()

    if not isinstance(workspace, dict):
        workspace = {}
    if not isinstance(runtime_alerts, dict):
        runtime_alerts = {}
    if not isinstance(workers, list):
        workers = []
    if not isinstance(approvals, list):
        approvals = []
    if not isinstance(projects, list):
        projects = []

    workspace_settings = workspace.get("settings") if isinstance(workspace.get("settings"), dict) else {}
    readiness_summary = workspace.get("readiness_summary") if isinstance(workspace.get("readiness_summary"), dict) else {}
    connection_center = workspace.get("connection_center") if isinstance(workspace.get("connection_center"), list) else []
    active_alerts = runtime_alerts.get("active_alerts") if isinstance(runtime_alerts.get("active_alerts"), list) else []
    worker_summaries = [
        {
            "slug": worker.get("slug"),
            "display_name": worker.get("display_name"),
            "status": worker.get("status"),
            "platform": worker.get("platform"),
            "capabilities": worker.get("capabilities"),
        }
        for worker in workers[:6]
        if isinstance(worker, dict)
    ]
    project_summaries = [
        {
            "slug": project.get("slug"),
            "client_name": project.get("client_name"),
            "status": project.get("status"),
            "service_type": project.get("service_type"),
        }
        for project in projects[:6]
        if isinstance(project, dict)
    ]
    return {
        "studio_name": workspace_settings.get("studio_name") or "Studio Brain",
        "public_base_url": workspace_settings.get("public_base_url") or "",
        "host_machine_type": workspace_settings.get("host_machine_type") or "other",
        "shared_paths": workspace_settings.get("shared_paths") or {},
        "integrations": workspace_settings.get("integrations") or {},
        "worker_config": workspace_settings.get("worker") or {},
        "readiness_summary": readiness_summary,
        "connection_center": [
            {
                "name": item.get("name"),
                "slug": item.get("slug"),
                "status": item.get("status"),
                "detail": item.get("detail"),
            }
            for item in connection_center[:8]
            if isinstance(item, dict)
        ],
        "active_alerts": active_alerts[:8],
        "approval_count": len(approvals),
        "bootstrap_status": bootstrap.get("status"),
        "workflow_count": bootstrap.get("workflow_count"),
        "workers": worker_summaries,
        "projects": project_summaries,
    }


def suggest_concierge_actions(message: str, context: dict) -> list[dict[str, str]]:
    lower = message.strip().lower()
    actions: list[dict[str, str]] = []
    if any(word in lower for word in ["setup", "connect", "gmail", "oauth", "n8n", "integration"]):
        actions.append({"id": "goto-settings", "label": "Open settings"})
    if any(word in lower for word in ["approval", "runtime", "alert", "task", "worker", "stop", "cancel"]):
        actions.append({"id": "goto-operations", "label": "Open operations"})
    if any(word in lower for word in ["rule", "automation", "starter pack", "openclaw"]):
        actions.append({"id": "goto-automation", "label": "Open automation"})
    if any(word in lower for word in ["project", "artifact", "style", "context", "storage", "share", "rag"]):
        actions.append({"id": "goto-context", "label": "Open context"})
    if any(word in lower for word in ["smoke", "validate", "dry run"]):
        actions.append({"id": "run-worker-smoke", "label": "Run worker smoke"})
    if "drain" in lower or "pause worker" in lower:
        actions.append({"id": "drain-worker", "label": "Drain worker"})
    if "resume" in lower:
        actions.append({"id": "resume-worker", "label": "Resume worker"})
    if "alert" in lower:
        actions.append({"id": "test-alerts", "label": "Send test alert"})
    if "starter" in lower or "baseline" in lower:
        actions.append({"id": "apply-operator-baseline", "label": "Apply operator baseline"})
    if not actions:
        pending_connection = next(
            (item for item in context.get("connection_center", []) if item.get("status") != "ready"),
            None,
        )
        if pending_connection:
            actions.append({"id": "goto-settings", "label": "Review setup"})
        actions.append({"id": "refresh", "label": "Refresh"})
    deduped: list[dict[str, str]] = []
    seen: set[str] = set()
    for action in actions:
        if action["id"] in seen:
            continue
        deduped.append(action)
        seen.add(action["id"])
        if len(deduped) == 3:
            break
    return deduped


def fallback_concierge_reply(message: str, context: dict) -> str:
    pending_connection = next(
        (item for item in context.get("connection_center", []) if item.get("status") != "ready"),
        None,
    )
    active_alerts = context.get("active_alerts") or []
    workers = context.get("workers") or []
    approvals = context.get("approval_count") or 0
    if pending_connection:
        return (
            f"Ollama is unavailable, so this assistant is in fallback mode. "
            f"The clearest next setup step is {pending_connection.get('name')}: {pending_connection.get('detail')} "
            f"There are {approvals} approvals waiting, {len(active_alerts)} active alerts, and {len(workers)} registered workers."
        )
    return (
        "Ollama is unavailable, so this assistant is in fallback mode. "
        f"The stack currently has {approvals} approvals waiting, {len(active_alerts)} active alerts, and {len(workers)} registered workers. "
        "Use the suggested actions to move to the right control surface."
    )


@app.get("/health")
async def health():
    return {"status": "ok", "policy": os.environ.get("POLICY_ENFORCEMENT", "strict")}


@app.get("/status")
async def status():
    pool = await get_pool()
    enabled_rules = await pool.fetchval("SELECT COUNT(*) FROM orchestration_rules WHERE enabled = TRUE")
    total_rules = await pool.fetchval("SELECT COUNT(*) FROM orchestration_rules")
    return {
        "status": "ok",
        "policy": os.environ.get("POLICY_ENFORCEMENT", "strict"),
        "enabled_rules": enabled_rules,
        "total_rules": total_rules,
        "starter_pack_count": len(starter_packs(None)),
        "playbook_count": len(default_playbooks()),
    }


@app.get("/policy/blocklist")
async def policy_blocklist():
    return {"blocklist": sorted(BLOCKLIST)}


@app.post("/policy/check")
async def policy_check(body: PolicyCheckBody):
    try:
        check_permission(body.action, body.tier)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc))
    return {"allowed": True, "action": body.action, "tier": body.tier}


@app.get("/rules")
async def list_rules(enabled_only: bool = True):
    pool = await get_pool()
    if enabled_only:
        rows = await pool.fetch(
            """SELECT r.*, s.name AS style_profile_name
               FROM orchestration_rules r
               LEFT JOIN style_profiles s ON s.id = r.style_profile_id
               WHERE r.enabled = true
               ORDER BY r.trigger_module, r.trigger_action"""
        )
    else:
        rows = await pool.fetch(
            """SELECT r.*, s.name AS style_profile_name
               FROM orchestration_rules r
               LEFT JOIN style_profiles s ON s.id = r.style_profile_id
               ORDER BY r.trigger_module, r.trigger_action"""
        )
    return [serialize_rule(row) for row in rows]


@app.get("/rule-packs")
async def list_rule_packs():
    pool = await get_pool()
    style_profile = await pool.fetchrow(
        "SELECT id FROM style_profiles WHERE name=$1 ORDER BY created_at ASC LIMIT 1",
        "Default Studio Tone",
    )
    return default_rule_packs(str(style_profile["id"]) if style_profile else None)


@app.get("/starter-packs")
async def list_starter_packs():
    pool = await get_pool()
    style_profile = await pool.fetchrow(
        "SELECT id FROM style_profiles WHERE name=$1 ORDER BY created_at ASC LIMIT 1",
        "Default Studio Tone",
    )
    return starter_packs(str(style_profile["id"]) if style_profile else None)


@app.post("/starter-packs/{slug}/apply")
async def apply_starter_pack(slug: str, body: ApplyStarterPackBody = ApplyStarterPackBody()):
    pool = await get_pool()
    style_profile = await pool.fetchrow(
        "SELECT id FROM style_profiles WHERE name=$1 ORDER BY created_at ASC LIMIT 1",
        "Default Studio Tone",
    )
    style_profile_id = str(style_profile["id"]) if style_profile else None
    try:
        application = starter_pack_application(slug, exclusive=body.exclusive, style_profile_id=style_profile_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Starter pack not found") from exc

    await seed_default_orchestration_rules(pool)
    for rule_slug in application["enabled_rule_slugs"]:
        await pool.execute(
            "UPDATE orchestration_rules SET enabled=true, updated_at=now() WHERE slug=$1",
            rule_slug,
        )
    for rule_slug in application["disabled_rule_slugs"]:
        await pool.execute(
            "UPDATE orchestration_rules SET enabled=false, updated_at=now() WHERE slug=$1",
            rule_slug,
        )

    enabled_rules = await pool.fetch(
        """SELECT r.*, s.name AS style_profile_name
           FROM orchestration_rules r
           LEFT JOIN style_profiles s ON s.id = r.style_profile_id
           WHERE r.enabled = true
           ORDER BY r.trigger_module, r.trigger_action"""
    )
    return {
        "status": "ok",
        "applied_pack": application["pack"],
        "exclusive": application["exclusive"],
        "enabled_rule_count": len(application["enabled_rule_slugs"]),
        "disabled_rule_count": len(application["disabled_rule_slugs"]),
        "active_rule_count": len(enabled_rules),
        "active_rules": [serialize_rule(row) for row in enabled_rules],
    }


@app.get("/playbooks")
async def list_playbooks():
    return default_playbooks()


@app.get("/alerts/config")
async def get_alert_config():
    return alert_config(load_workspace_settings())


@app.post("/alerts/test")
async def send_test_alert(body: AlertTestBody):
    workspace_settings = load_workspace_settings()
    event = build_alert_event(
        body.slug,
        body.severity,
        body.detail,
        source="operator:test-alert",
        summary=body.summary,
        context=body.context,
        kind="test-alert",
        test=True,
    )
    return send_alert_event(
        event,
        workspace_settings,
        channels=body.channels,
        dry_run=body.dry_run,
    )


@app.post("/alerts/dispatch-active")
async def dispatch_active_alerts():
    workspace_settings = load_workspace_settings()
    runtime = load_runtime_alerts()
    alerts = runtime.get("active_alerts") or []
    if not alerts:
        return {
            "status": "ok",
            "dispatched_count": 0,
            "results": [],
        }

    results = [
        send_alert_event(
            build_alert_event(
                alert["slug"],
                alert["severity"],
                alert["detail"],
                source="runtime-summary",
            ),
            workspace_settings,
        )
        for alert in alerts
    ]
    return {
        "status": "ok",
        "dispatched_count": len(results),
        "results": results,
    }


@app.get("/bootstrap/status")
async def get_bootstrap_status():
    return bootstrap_status()


@app.post("/bootstrap/defaults")
async def bootstrap_defaults():
    pool = await get_pool()
    await seed_default_orchestration_rules(pool)
    return {
        "status": "ok",
        "seeded_rule_count": len(default_orchestration_rules(None)),
        "rule_pack_count": len(default_rule_packs(None)),
        "starter_pack_count": len(starter_packs(None)),
        "playbook_count": len(default_playbooks()),
        "configured_alert_channel_count": alert_config(load_workspace_settings())["configured_channel_count"],
        "bootstrap_status": bootstrap_status()["status"],
    }


@app.post("/concierge/respond", response_model=ConciergeResponse)
async def concierge_respond(body: ConciergeBody):
    message = body.message.strip()
    if not message:
        raise HTTPException(status_code=422, detail="message is required")

    context = build_concierge_context()
    prompt = f"""
You are the AI Audio Studio control-room assistant.
Answer the operator's question concisely and honestly using the live stack context below.
Do not invent capabilities that are not present.
If a feature depends on external credentials or a live workstation, say that clearly.
Prefer direct operational guidance over marketing language.

Return strict JSON with this shape:
{{
  "reply": "short operator-facing answer"
}}

Live control-room context:
{json.dumps(context, indent=2)}

Operator message:
{message}
""".strip()

    actions = suggest_concierge_actions(message, context)
    try:
        raw = _ollama_generate(prompt)
        parsed = _extract_json_object(raw) or {}
        reply = str(parsed.get("reply") or "").strip()
        if not reply:
            raise ValueError("missing reply")
        return ConciergeResponse(
            status="ok",
            mode="llm",
            reply=reply,
            actions=actions,
            context_summary={
                "approval_count": context["approval_count"],
                "active_alert_count": len(context["active_alerts"]),
                "worker_count": len(context["workers"]),
                "project_count": len(context["projects"]),
            },
        )
    except Exception:
        return ConciergeResponse(
            status="ok",
            mode="fallback",
            reply=fallback_concierge_reply(message, context),
            actions=actions,
            context_summary={
                "approval_count": context["approval_count"],
                "active_alert_count": len(context["active_alerts"]),
                "worker_count": len(context["workers"]),
                "project_count": len(context["projects"]),
            },
        )


@app.post("/rules", status_code=201)
async def create_rule(body: CreateRuleBody):
    check_permission("create_job", body.required_tier)
    pool = await get_pool()
    if body.style_profile_id is not None:
        profile = await pool.fetchrow("SELECT id FROM style_profiles WHERE id=$1", body.style_profile_id)
        if profile is None:
            raise HTTPException(status_code=404, detail="Style profile not found")
    row = await pool.fetchrow(
        """INSERT INTO orchestration_rules
           (slug, name, trigger_module, trigger_action, target_module, required_tier,
            approval_required, enabled, style_profile_id, conditions)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)
           ON CONFLICT (slug) DO UPDATE SET
             name=EXCLUDED.name,
             trigger_module=EXCLUDED.trigger_module,
             trigger_action=EXCLUDED.trigger_action,
             target_module=EXCLUDED.target_module,
             required_tier=EXCLUDED.required_tier,
             approval_required=EXCLUDED.approval_required,
             enabled=EXCLUDED.enabled,
             style_profile_id=EXCLUDED.style_profile_id,
             conditions=EXCLUDED.conditions,
             updated_at=now()
           RETURNING *""",
        body.slug,
        body.name,
        body.trigger_module,
        body.trigger_action,
        body.target_module,
        body.required_tier,
        body.approval_required,
        body.enabled,
        body.style_profile_id,
        json.dumps(body.conditions),
    )
    return serialize_rule(row)


@app.post("/dispatch", status_code=201)
async def dispatch(body: DispatchBody):
    assert_module_enabled(body.module)
    try:
        check_permission(body.action, body.tier)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc))
    pool = await get_pool()
    job = await pool.fetchrow(
        """INSERT INTO jobs
           (project_id, module, action, trigger_type, trigger_payload, status, approval_required, requested_by)
           VALUES ($1,$2,$3,'openclaw',$4::jsonb,'pending',$5,'system:openclaw')
           RETURNING *""",
        body.project_id,
        body.module,
        body.action,
        json.dumps(body.trigger_payload),
        body.approval_required,
    )
    await pool.execute(
        """INSERT INTO audit_log (job_id, project_id, actor, action, tier, payload)
           VALUES ($1,$2,'system:openclaw','dispatch',$3,$4::jsonb)""",
        job["id"],
        body.project_id,
        body.tier,
        json.dumps({"module": body.module, "route": WORKER_URLS.get(body.module)}),
    )
    return {
        "job_id": str(job["id"]),
        "module": body.module,
        "route": WORKER_URLS.get(body.module),
        "status": "pending",
    }


@app.post("/dispatch/by-trigger", status_code=201)
async def dispatch_by_trigger(body: TriggerDispatchBody):
    pool = await get_pool()
    rows = await pool.fetch(
        """SELECT r.*, s.name AS style_profile_name, s.extracted_guidance
           FROM orchestration_rules r
           LEFT JOIN style_profiles s ON s.id = r.style_profile_id
           WHERE r.enabled = true AND r.trigger_module=$1 AND r.trigger_action=$2
           ORDER BY r.created_at ASC
           """,
        body.trigger_module,
        body.trigger_action,
    )
    rule = next(
        (serialize_rule(row) for row in rows if matches_conditions(decode_jsonb(row["conditions"]) or {}, body.context)),
        None,
    )
    if rule is None:
        raise HTTPException(status_code=404, detail="No enabled orchestration rule matched this trigger")
    assert_module_enabled(rule["target_module"])

    try:
        check_permission("create_job", rule["required_tier"])
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc))

    trigger_payload = {
        **body.context,
        "trigger_module": body.trigger_module,
        "trigger_action": body.trigger_action,
        "style_profile": {
            "id": str(rule["style_profile_id"]) if rule["style_profile_id"] else None,
            "name": rule["style_profile_name"],
            "guidance": rule["extracted_guidance"] if rule["extracted_guidance"] else None,
        },
        "rule_slug": rule["slug"],
    }
    job = await pool.fetchrow(
        """INSERT INTO jobs
           (project_id, module, action, trigger_type, trigger_payload, status, approval_required, requested_by)
           VALUES ($1,$2,$3,'openclaw-rule',$4::jsonb,'pending',$5,'system:openclaw')
           RETURNING *""",
        body.project_id,
        rule["target_module"],
        body.trigger_action,
        json.dumps(trigger_payload),
        rule["approval_required"],
    )
    await pool.execute(
        """INSERT INTO audit_log (job_id, project_id, actor, action, tier, payload)
           VALUES ($1,$2,'system:openclaw','dispatch-by-rule',$3,$4::jsonb)""",
        job["id"],
        body.project_id,
        rule["required_tier"],
        json.dumps({"rule_slug": rule["slug"], "target_module": rule["target_module"]}),
    )
    return {
        "job_id": str(job["id"]),
        "rule_slug": rule["slug"],
        "target_module": rule["target_module"],
        "status": "pending",
    }

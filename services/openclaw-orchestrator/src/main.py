"""OpenClaw Orchestrator — policy-enforced routing to workers."""

from __future__ import annotations

import json
import os
from contextlib import asynccontextmanager

import asyncpg
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from .policy import BLOCKLIST, check_permission
from .rules import (
    default_orchestration_rules,
    decode_jsonb,
    matches_conditions,
    serialize_rule,
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

DEFAULT_ORCHESTRATION_RULES = (
    {
        "slug": "lead-intake-email",
        "name": "Lead Intake From Email",
        "trigger_module": "lead-source",
        "trigger_action": "new-lead",
        "target_module": "lead-intake",
        "required_tier": 3,
        "approval_required": True,
        "enabled": True,
        "conditions": {"channel": ["form", "email", "dm"]},
    },
    {
        "slug": "inbox-triage-email",
        "name": "Inbox Triage From Email",
        "trigger_module": "inbox-source",
        "trigger_action": "new-message",
        "target_module": "inbox-triage",
        "required_tier": 3,
        "approval_required": True,
        "enabled": True,
        "conditions": {"label": ["NeedsReply", "Clients", "Leads"]},
    },
    {
        "slug": "content-social-draft",
        "name": "Content Brief To Social Draft",
        "trigger_module": "content-source",
        "trigger_action": "new-brief",
        "target_module": "social-drafting",
        "required_tier": 2,
        "approval_required": True,
        "enabled": True,
        "conditions": {"platform": ["instagram", "threads", "linkedin"]},
    },
    {
        "slug": "session-prep-import",
        "name": "Session Prep From Stem Import",
        "trigger_module": "session-source",
        "trigger_action": "import-stems",
        "target_module": "session-prep",
        "required_tier": 4,
        "approval_required": True,
        "enabled": True,
        "conditions": {},
    },
    {
        "slug": "revision-parse-notes",
        "name": "Revision Notes To Parse Job",
        "trigger_module": "revision-source",
        "trigger_action": "notes-received",
        "target_module": "revision-parser",
        "required_tier": 3,
        "approval_required": True,
        "enabled": True,
        "conditions": {"daw": ["protools", "reaper"]},
    },
    {
        "slug": "delivery-package-qc-pass",
        "name": "QC Pass To Delivery Packaging",
        "trigger_module": "qc-source",
        "trigger_action": "qc-pass",
        "target_module": "delivery-packager",
        "required_tier": 3,
        "approval_required": True,
        "enabled": True,
        "conditions": {"overall_pass": [True]},
    },
)

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


@app.get("/health")
async def health():
    return {"status": "ok", "policy": os.environ.get("POLICY_ENFORCEMENT", "strict")}


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

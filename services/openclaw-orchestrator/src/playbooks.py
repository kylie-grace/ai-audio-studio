"""Operator-facing starter playbooks for turnkey orchestration."""

from __future__ import annotations


DEFAULT_PLAYBOOKS = (
    {
        "slug": "lead-intake-starter",
        "name": "Lead Intake Starter",
        "summary": "Receives a new lead from email, form, or DM intake and routes it to lead normalization and draft reply generation.",
        "n8n_workflow_slug": "lead-source-new-lead",
        "trigger_module": "lead-source",
        "trigger_action": "new-lead",
        "target_module": "lead-intake",
        "webhook_path": "/webhook/studio/lead-source/new-lead",
        "required_context": ["source", "raw_text"],
        "optional_context": ["form_fields", "received_at"],
        "style_profile_scope": "studio",
    },
    {
        "slug": "inbox-triage-starter",
        "name": "Inbox Triage Starter",
        "summary": "Receives inbound client or lead email metadata and drafts a response candidate for approval.",
        "n8n_workflow_slug": "inbox-source-new-message",
        "trigger_module": "inbox-source",
        "trigger_action": "new-message",
        "target_module": "inbox-triage",
        "webhook_path": "/webhook/studio/inbox-source/new-message",
        "required_context": ["thread_id", "message_id", "subject", "from", "body_text"],
        "optional_context": ["labels", "received_at"],
        "style_profile_scope": "studio",
    },
    {
        "slug": "content-brief-starter",
        "name": "Content Brief Starter",
        "summary": "Takes a new content brief and routes it into social caption drafting with the default studio tone profile.",
        "n8n_workflow_slug": "content-source-new-brief",
        "trigger_module": "content-source",
        "trigger_action": "new-brief",
        "target_module": "social-drafting",
        "webhook_path": "/webhook/studio/content-source/new-brief",
        "required_context": ["project_id", "content_type", "brief", "platform"],
        "optional_context": ["asset_paths", "campaign_name"],
        "style_profile_scope": "studio",
    },
    {
        "slug": "session-prep-starter",
        "name": "Session Prep Starter",
        "summary": "Routes newly imported stems into session organization and prep reporting before mix work begins.",
        "n8n_workflow_slug": "session-source-import-stems",
        "trigger_module": "session-source",
        "trigger_action": "import-stems",
        "target_module": "session-prep",
        "webhook_path": "/webhook/studio/session-source/import-stems",
        "required_context": ["source_dir"],
        "optional_context": ["project_id", "client_name", "worker_slug"],
        "style_profile_scope": "none",
    },
    {
        "slug": "revision-notes-starter",
        "name": "Revision Notes Starter",
        "summary": "Routes revision notes into the parser, generates DAW execution artifacts, and waits for approval before execution.",
        "n8n_workflow_slug": "revision-source-notes-received",
        "trigger_module": "revision-source",
        "trigger_action": "notes-received",
        "target_module": "revision-parser",
        "webhook_path": "/webhook/studio/revision-source/notes-received",
        "required_context": ["project_id", "notes", "daw", "session_path"],
        "optional_context": ["worker_slug"],
        "style_profile_scope": "project-or-studio",
    },
    {
        "slug": "qc-pass-delivery-starter",
        "name": "Delivery Packaging Starter",
        "summary": "Queues delivery packaging once QC passes, preserving the approval gate before any client-facing handoff.",
        "n8n_workflow_slug": "qc-source-qc-pass",
        "trigger_module": "qc-source",
        "trigger_action": "qc-pass",
        "target_module": "delivery-packager",
        "webhook_path": "/webhook/studio/qc-source/qc-pass",
        "required_context": ["project_id", "report_id", "overall_pass"],
        "optional_context": ["delivery_notes"],
        "style_profile_scope": "none",
    },
)


def default_playbooks() -> list[dict]:
    return [dict(playbook) for playbook in DEFAULT_PLAYBOOKS]

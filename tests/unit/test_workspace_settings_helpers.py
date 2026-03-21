"""Pure tests for workspace bootstrap helpers."""

from __future__ import annotations

from datetime import datetime, timezone
import importlib.util
import os

ROOT = os.path.join(os.path.dirname(__file__), "../..")
SERVICE_ROOT = os.path.join(ROOT, "services/crm-api")

SPEC = importlib.util.spec_from_file_location(
    "crm_workspace_settings",
    os.path.join(SERVICE_ROOT, "src/workspace_settings.py"),
)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)

default_workspace_settings = MODULE.default_workspace_settings
default_module_settings = MODULE.default_module_settings
serialize_workspace_settings = MODULE.serialize_workspace_settings
workspace_status = MODULE.workspace_status


def test_default_workspace_settings_has_operator_and_style_seed():
    defaults = default_workspace_settings()

    assert defaults["operator_name"]
    assert defaults["style_seed"]["raw_text"]
    assert "shared_paths" in defaults
    assert defaults["host_machine_type"]
    assert defaults["module_settings"] == default_module_settings()


def test_workspace_status_flags_missing_setup_fields():
    status = workspace_status(
        {
            "studio_name": "Your Studio Name",
            "operator_name": "",
            "shared_paths": {"projects": "", "deliveries": "", "approval_queue": ""},
            "style_seed": {"raw_text": ""},
            "deployment_mode": "control_plane_plus_worker",
            "worker": {"worker_slug": "", "worker_api_base_url": ""},
            "onboarding_complete": False,
        },
        style_profile_count=1,
    )

    assert status["onboarding_required"] is True
    assert "studio_name" in status["missing_fields"]
    assert "worker.worker_slug" in status["missing_fields"]
    assert any(check["slug"] == "shared-paths" and check["status"] == "needs-attention" for check in status["readiness_checks"])


def test_workspace_status_marks_complete_when_required_fields_exist():
    status = workspace_status(
        {
            "studio_name": "Studio North",
            "operator_name": "owner",
            "shared_paths": {
                "projects": "/Volumes/StudioShare/projects",
                "deliveries": "/Volumes/StudioShare/deliveries",
                "approval_queue": "/Volumes/StudioShare/approval-queue",
            },
            "style_seed": {"raw_text": "Warm, direct, professional."},
            "deployment_mode": "single_machine",
            "worker": {"worker_slug": "", "worker_api_base_url": ""},
            "module_settings": default_module_settings(),
            "onboarding_complete": True,
        },
        style_profile_count=2,
    )

    assert status["onboarding_required"] is False
    assert status["missing_fields"] == []
    assert status["readiness_summary"]["ready_count"] >= 3
    assert any(card["slug"] == "n8n" for card in status["connection_center"])
    assert any(check["slug"] == "worker-posture" and check["status"] == "optional" for check in status["readiness_checks"])
    assert any(check["slug"] == "service-tuning" and check["status"] == "ready" for check in status["readiness_checks"])


def test_default_workspace_settings_prefers_authorized_actor_and_env_integrations(monkeypatch):
    monkeypatch.setenv("AUTHORIZED_ACTORS", "engineer,owner")
    monkeypatch.setenv("STUDIO_NAME", "North Loop")
    monkeypatch.setenv("SHARED_PROJECTS_PATH", "/Volumes/StudioShare/projects")
    monkeypatch.setenv("DELIVERY_PATH", "/Volumes/StudioShare/deliveries")
    monkeypatch.setenv("DRAFT_QUEUE_PATH", "/Volumes/StudioShare/draft-queue")
    monkeypatch.setenv("APPROVAL_QUEUE_PATH", "/Volumes/StudioShare/approval-queue")
    monkeypatch.setenv("WATCHED_STEMS_PATH", "/Volumes/StudioShare/incoming-stems")
    monkeypatch.setenv("ALERT_EMAIL_TO", "ops@example.test,owner@example.test")
    monkeypatch.setenv("ALERT_WEBHOOK_URL", "https://hooks.example.test/studio")
    monkeypatch.setenv("GMAIL_CLIENT_ID", "gmail-ro")
    monkeypatch.setenv("GMAIL_SEND_CLIENT_ID", "gmail-send")
    monkeypatch.setenv("INSTAGRAM_ACCESS_TOKEN", "ig-token")
    monkeypatch.setenv("FACEBOOK_ACCESS_TOKEN", "fb-token")
    monkeypatch.setenv("WORKER_SLUG", "studio-mac")
    monkeypatch.setenv("WORKER_API_BASE_URL", "http://studio-mac.local:8190")

    defaults = default_workspace_settings()

    assert defaults["operator_name"] == "engineer"
    assert defaults["studio_name"] == "North Loop"
    assert defaults["host_machine_type"] == "other"
    assert defaults["shared_paths"]["projects"] == "/Volumes/StudioShare/projects"
    assert defaults["alert_destinations"]["email_to"] == ["ops@example.test", "owner@example.test"]
    assert defaults["alert_destinations"]["webhook_url"] == "https://hooks.example.test/studio"
    assert defaults["integrations"] == {
        "n8n": True,
        "gmail_readonly": True,
        "gmail_send": True,
        "instagram": True,
        "facebook": True,
    }
    assert defaults["worker"] == {
        "enabled": False,
        "worker_slug": "studio-mac",
        "worker_api_base_url": "http://studio-mac.local:8190",
        "display_name": "",
        "platform": "macos",
        "default_daw": "reaper",
        "supported_daws": ["reaper"],
        "adapter_capabilities": ["execute-reascript"],
        "dry_run_daw": False,
        "reaper_binary_path": "",
        "protools_app_path": "",
        "soundflow_cli_path": "",
        "notes": "",
    }


def test_serialize_workspace_settings_decodes_json_and_timestamps():
    now = datetime(2026, 3, 20, 20, 30, tzinfo=timezone.utc)
    serialized = serialize_workspace_settings(
        {
            "studio_name": "North Loop",
            "deployment_mode": "control_plane_plus_worker",
            "host_machine_type": "mac-mini",
            "public_base_url": "https://studio-brain.local",
            "https_mode": "caddy_internal",
            "operator_name": "owner",
            "shared_paths": '{"projects":"/Volumes/StudioShare/projects","deliveries":"/Volumes/StudioShare/deliveries"}',
            "style_seed": '{"name":"Default Studio Tone","raw_text":"Warm and direct."}',
            "alert_destinations": '{"email_to":["ops@example.test"],"webhook_url":"https://hooks.example.test/studio"}',
            "integrations": '{"n8n":true,"gmail_readonly":true,"gmail_send":false,"instagram":false,"facebook":false}',
            "worker_config": '{"enabled":true,"worker_slug":"studio-mac","worker_api_base_url":"http://studio-mac.local:8190","display_name":"Studio Mac","default_daw":"protools","supported_daws":["protools","reaper"],"adapter_capabilities":["execute-soundflow","execute-reascript"]}',
            "module_settings": '{"lead_intake":{"enabled":true,"minimum_fit_score":72,"response_sla_hours":12,"auto_create_projects":true}}',
            "onboarding_complete": True,
            "created_at": now,
            "updated_at": now,
        }
    )

    assert serialized["shared_paths"]["projects"] == "/Volumes/StudioShare/projects"
    assert serialized["host_machine_type"] == "mac-mini"
    assert serialized["style_seed"]["name"] == "Default Studio Tone"
    assert serialized["alert_destinations"]["email_to"] == ["ops@example.test"]
    assert serialized["integrations"]["gmail_readonly"] is True
    assert serialized["worker"]["enabled"] is True
    assert serialized["worker"]["display_name"] == "Studio Mac"
    assert serialized["worker"]["default_daw"] == "protools"
    assert serialized["module_settings"]["lead_intake"]["minimum_fit_score"] == 72
    assert serialized["created_at"] == now.isoformat()
    assert serialized["updated_at"] == now.isoformat()

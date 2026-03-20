"""Alert config and delivery helpers for OpenClaw."""

from __future__ import annotations

import importlib.util
import os

ROOT = os.path.join(os.path.dirname(__file__), "../..")
SERVICE_ROOT = os.path.join(ROOT, "services/openclaw-orchestrator")

SPEC = importlib.util.spec_from_file_location("openclaw_alerts", os.path.join(SERVICE_ROOT, "src/alerts.py"))
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)

alert_config = MODULE.alert_config
build_alert_event = MODULE.build_alert_event
fan_out_alert = MODULE.fan_out_alert
resolve_alert_destinations = MODULE.resolve_alert_destinations
send_alert_event = MODULE.send_alert_event


def test_alert_config_reports_default_and_optional_channels(monkeypatch):
    monkeypatch.delenv("ALERT_WEBHOOK_URL", raising=False)
    monkeypatch.delenv("ALERT_EMAIL_TO", raising=False)
    monkeypatch.delenv("ALERT_N8N_WEBHOOK_URL", raising=False)
    monkeypatch.delenv("N8N_WEBHOOK_URL", raising=False)

    config = alert_config()
    by_slug = {channel["slug"]: channel for channel in config["channels"]}

    assert config["configured_channel_count"] == 2
    assert by_slug["dashboard"]["configured"] is True
    assert by_slug["n8n"]["configured"] is True
    assert by_slug["webhook"]["configured"] is False
    assert by_slug["email"]["configured"] is False
    assert len(config["thresholds"]) >= 3


def test_alert_config_marks_optional_channels_when_values_exist(monkeypatch):
    monkeypatch.setenv("ALERT_WEBHOOK_URL", "https://hooks.example.test/studio")
    monkeypatch.setenv("ALERT_EMAIL_TO", "ops@example.test")

    config = alert_config()
    by_slug = {channel["slug"]: channel for channel in config["channels"]}

    assert config["configured_channel_count"] == 4
    assert by_slug["webhook"]["configured"] is True
    assert by_slug["email"]["configured"] is True


def test_alert_destinations_use_workspace_overrides(monkeypatch):
    monkeypatch.setenv("ALERT_WEBHOOK_URL", "https://hooks.example.test/env")
    monkeypatch.setenv("ALERT_EMAIL_TO", "env@example.test")

    resolved = resolve_alert_destinations(
        {
            "alert_destinations": {
                "webhook_url": "https://hooks.example.test/workspace",
                "email_to": ["workspace@example.test"],
            }
        }
    )

    assert resolved["webhook_url"] == "https://hooks.example.test/workspace"
    assert resolved["email_to"] == ["workspace@example.test"]


def test_fan_out_alert_dry_run_reports_ready_channels(monkeypatch):
    monkeypatch.setenv("N8N_WEBHOOK_URL", "http://localhost:5678")
    event = build_alert_event("operator-test", "warn", "Synthetic alert body.", test=True)

    result = fan_out_alert(
        event,
        {
            "alert_destinations": {
                "webhook_url": "https://hooks.example.test/workspace",
                "email_to": ["ops@example.test"],
            }
        },
        dry_run=True,
    )

    by_channel = {item["channel"]: item for item in result["deliveries"]}
    assert result["status"] == "dry-run"
    assert by_channel["dashboard"]["status"] == "ready"
    assert by_channel["webhook"]["status"] == "ready"
    assert by_channel["email"]["status"] == "ready"
    assert by_channel["n8n"]["status"] == "ready"


def test_send_alert_event_posts_webhook_and_marks_email_sent(monkeypatch):
    captured_posts = []

    def fake_post(url, payload):
        captured_posts.append((url, payload))
        return {"status": "sent", "detail": "HTTP 200", "http_status": 200}

    def fake_send_email(event, recipients):
        return {
            "status": "sent",
            "detail": f"Email sent to {len(recipients)} recipient(s).",
            "recipient_count": len(recipients),
        }

    monkeypatch.setattr(MODULE, "_post_json", fake_post)
    monkeypatch.setattr(MODULE, "_send_email", fake_send_email)
    monkeypatch.setenv("N8N_WEBHOOK_URL", "http://localhost:5678")

    event = build_alert_event("worker-failure", "bad", "Worker task failed.", source="runtime-summary")
    result = send_alert_event(
        event,
        {
            "alert_destinations": {
                "webhook_url": "https://hooks.example.test/workspace",
                "email_to": ["ops@example.test", "owner@example.test"],
            }
        },
    )

    deliveries = {item["channel"]: item for item in result["delivery"]["deliveries"]}
    urls = {item[0] for item in captured_posts}

    assert result["delivery"]["status"] == "sent"
    assert result["deliveries"] == result["delivery"]["deliveries"]
    assert deliveries["dashboard"]["status"] == "sent"
    assert deliveries["webhook"]["status"] == "sent"
    assert deliveries["email"]["status"] == "sent"
    assert deliveries["n8n"]["status"] == "sent"
    assert "https://hooks.example.test/workspace" in urls
    assert "http://localhost:5678/webhook/studio/alerts" in urls


def test_send_alert_event_reports_webhook_and_email_failures(monkeypatch):
    def fake_post(url, payload):
        return {"status": "failed", "detail": "downstream unavailable", "http_status": 503}

    def fake_send_email(event, recipients):
        return {
            "status": "failed",
            "detail": "smtp unavailable",
            "recipient_count": len(recipients),
        }

    monkeypatch.setattr(MODULE, "_post_json", fake_post)
    monkeypatch.setattr(MODULE, "_send_email", fake_send_email)
    monkeypatch.delenv("N8N_WEBHOOK_URL", raising=False)

    result = send_alert_event(
        build_alert_event("operator-test", "warn", "Manual test"),
        {
            "alert_destinations": {
                "webhook_url": "https://hooks.example.test/workspace",
                "email_to": ["ops@example.test"],
            }
        },
    )

    by_channel = {delivery["channel"]: delivery for delivery in result["deliveries"]}
    assert result["delivery"]["status"] == "partial"
    assert by_channel["webhook"]["status"] == "failed"
    assert by_channel["email"]["status"] == "failed"
    assert by_channel["n8n"]["status"] == "skipped"

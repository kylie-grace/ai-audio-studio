"""Alert config helpers should expose configured channels and defaults."""

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
resolve_alert_destinations = MODULE.resolve_alert_destinations
build_alert_event = MODULE.build_alert_event
send_alert_event = MODULE.send_alert_event


def test_alert_config_reports_default_and_optional_channels(monkeypatch):
    monkeypatch.delenv("ALERT_WEBHOOK_URL", raising=False)
    monkeypatch.delenv("ALERT_EMAIL_TO", raising=False)

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


def test_workspace_destinations_override_env(monkeypatch):
    monkeypatch.setenv("ALERT_WEBHOOK_URL", "https://hooks.example.test/env")
    monkeypatch.setenv("ALERT_EMAIL_TO", "env@example.test")

    destinations = resolve_alert_destinations(
        {
            "alert_destinations": {
                "webhook_url": "https://hooks.example.test/workspace",
                "email_to": ["workspace@example.test"],
            }
        }
    )

    assert destinations["webhook_url"] == "https://hooks.example.test/workspace"
    assert destinations["email_to"] == ["workspace@example.test"]


def test_send_alert_event_reports_delivery_status(monkeypatch):
    class FakeResponse:
        status = 202

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

    monkeypatch.setattr(MODULE.urllib.request, "urlopen", lambda request, timeout=5: FakeResponse())

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
    assert by_channel["webhook"]["status"] == "sent"
    assert by_channel["email"]["status"] == "prepared"

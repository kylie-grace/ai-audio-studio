"""Alerting inventory and threshold defaults for operator-facing surfaces."""

from __future__ import annotations

import os


def alert_config() -> dict:
    webhook_url = os.environ.get("ALERT_WEBHOOK_URL", "").strip()
    alert_email_to = os.environ.get("ALERT_EMAIL_TO", "").strip()

    channels = [
        {
            "slug": "dashboard",
            "name": "Dashboard",
            "configured": True,
            "detail": "Live warnings remain visible in the operator console.",
        },
        {
            "slug": "n8n",
            "name": "n8n",
            "configured": True,
            "detail": "Starter workflows can fan out alert jobs inside n8n.",
        },
        {
            "slug": "webhook",
            "name": "Webhook",
            "configured": bool(webhook_url),
            "detail": webhook_url or "Set ALERT_WEBHOOK_URL to fan out to Slack, Discord, or a custom receiver.",
        },
        {
            "slug": "email",
            "name": "Email",
            "configured": bool(alert_email_to),
            "detail": alert_email_to or "Set ALERT_EMAIL_TO to route escalations to an operator inbox.",
        },
    ]

    thresholds = [
        {
            "slug": "approval-backlog",
            "name": "Approval backlog",
            "condition": "5 or more jobs waiting for approval",
            "severity": "warn",
        },
        {
            "slug": "worker-failure",
            "name": "Worker failure",
            "condition": "Any worker task enters failed state",
            "severity": "bad",
        },
        {
            "slug": "stale-worker",
            "name": "Stale worker heartbeat",
            "condition": "Worker has not heartbeated in 5 minutes",
            "severity": "warn",
        },
    ]

    configured_count = sum(1 for channel in channels if channel["configured"])
    return {
        "configured_channel_count": configured_count,
        "channels": channels,
        "thresholds": thresholds,
    }

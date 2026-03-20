"""Alert configuration and delivery helpers."""

from __future__ import annotations

import json
import os
import smtplib
import ssl
import urllib.error
import urllib.request
from datetime import datetime, timezone
from email.message import EmailMessage
from typing import Any

DEFAULT_N8N_ALERT_PATH = "/webhook/studio/alerts"
DEFAULT_EMAIL_FROM = "openclaw@localhost"
DEFAULT_EMAIL_SUBJECT_PREFIX = "[AI Audio Studio]"
DEFAULT_CHANNELS = ("dashboard", "n8n", "webhook", "email")


def _split_csv(value: str) -> list[str]:
    expanded = value.replace(";", ",").replace("\n", ",")
    return [item.strip() for item in expanded.split(",") if item.strip()]


def _parse_bool(value: str | None, default: bool = False) -> bool:
    if value is None:
        return default
    return value.strip().lower() not in {"0", "false", "no", "off", ""}


def resolve_alert_destinations(workspace_settings: dict[str, Any] | None = None) -> dict[str, Any]:
    workspace_alerts = (workspace_settings or {}).get("alert_destinations") or {}
    webhook_url = str(workspace_alerts.get("webhook_url") or os.environ.get("ALERT_WEBHOOK_URL", "")).strip()

    email_to = workspace_alerts.get("email_to")
    if isinstance(email_to, list):
        email_destinations = [str(item).strip() for item in email_to if str(item).strip()]
    else:
        email_destinations = _split_csv(os.environ.get("ALERT_EMAIL_TO", ""))

    n8n_alert_webhook_url = os.environ.get("ALERT_N8N_WEBHOOK_URL", "").strip()
    n8n_base_url = os.environ.get("N8N_WEBHOOK_URL", "").strip()
    if not n8n_alert_webhook_url and n8n_base_url:
        n8n_alert_webhook_url = f"{n8n_base_url.rstrip('/')}{DEFAULT_N8N_ALERT_PATH}"

    return {
        "webhook_url": webhook_url,
        "email_to": email_destinations,
        "n8n_webhook_url": n8n_alert_webhook_url,
    }


def alert_config(workspace_settings: dict[str, Any] | None = None) -> dict:
    destinations = resolve_alert_destinations(workspace_settings)
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
            "detail": destinations["n8n_webhook_url"]
            or "Set ALERT_N8N_WEBHOOK_URL or wire a workflow to the conventional /webhook/studio/alerts path.",
        },
        {
            "slug": "webhook",
            "name": "Webhook",
            "configured": bool(destinations["webhook_url"]),
            "detail": destinations["webhook_url"]
            or "Set a workspace or env webhook destination for Slack, Discord, or a custom receiver.",
        },
        {
            "slug": "email",
            "name": "Email",
            "configured": bool(destinations["email_to"]),
            "detail": ", ".join(destinations["email_to"])
            or "Set alert email recipients in workspace settings or ALERT_EMAIL_TO.",
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


def build_alert_event(
    slug: str,
    severity: str = "warn",
    detail: str = "",
    source: str = "openclaw",
    *,
    summary: str | None = None,
    context: dict[str, Any] | None = None,
    kind: str = "runtime-alert",
    test: bool = False,
) -> dict[str, Any]:
    resolved_summary = (summary or slug.replace("-", " ").title() or slug).strip()
    return {
        "slug": slug,
        "summary": resolved_summary,
        "severity": severity,
        "detail": detail.strip(),
        "source": source,
        "kind": kind,
        "test": test,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "context": context or {},
    }


def _format_email_body(event: dict[str, Any]) -> str:
    lines = [
        f"Summary: {event.get('summary') or event.get('slug')}",
        f"Severity: {event['severity']}",
        f"Source: {event['source']}",
        f"Test alert: {'yes' if event.get('test') else 'no'}",
        "",
        event["detail"],
    ]
    if event.get("context"):
        lines.extend(["", "Context:", json.dumps(event["context"], indent=2, sort_keys=True)])
    return "\n".join(lines)


def _post_json(url: str, payload: dict[str, Any]) -> dict[str, Any]:
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "User-Agent": "ai-audio-studio/openclaw-alerts",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=5) as response:
            body = response.read(512).decode("utf-8", errors="ignore")
            return {
                "status": "sent",
                "detail": body or f"HTTP {getattr(response, 'status', 200)}",
                "http_status": getattr(response, "status", 200),
            }
    except urllib.error.HTTPError as exc:
        body = exc.read(512).decode("utf-8", errors="ignore")
        return {
            "status": "failed",
            "detail": body or str(exc),
            "http_status": exc.code,
        }
    except urllib.error.URLError as exc:
        return {
            "status": "failed",
            "detail": str(exc.reason),
        }


def _send_email(event: dict[str, Any], recipients: list[str]) -> dict[str, Any]:
    if not recipients:
        return {
            "status": "skipped",
            "detail": "No alert email recipients configured.",
        }

    smtp_host = os.environ.get("SMTP_HOST", "").strip()
    if not smtp_host:
        return {
            "status": "skipped",
            "detail": "SMTP_HOST is not configured for email delivery.",
        }

    smtp_port = int(os.environ.get("SMTP_PORT", "587"))
    use_tls = _parse_bool(os.environ.get("SMTP_USE_TLS"), default=True)
    smtp_username = os.environ.get("SMTP_USERNAME", "").strip()
    smtp_password = os.environ.get("SMTP_PASSWORD", "")
    from_address = os.environ.get("ALERT_EMAIL_FROM", DEFAULT_EMAIL_FROM).strip() or DEFAULT_EMAIL_FROM
    subject_prefix = os.environ.get("ALERT_EMAIL_SUBJECT_PREFIX", DEFAULT_EMAIL_SUBJECT_PREFIX).strip() or DEFAULT_EMAIL_SUBJECT_PREFIX

    message = EmailMessage()
    message["From"] = from_address
    message["To"] = ", ".join(recipients)
    message["Subject"] = f"{subject_prefix} {event.get('summary') or event.get('slug')}"
    message.set_content(_format_email_body(event))

    try:
        with smtplib.SMTP(smtp_host, smtp_port, timeout=5) as client:
            client.ehlo()
            if use_tls:
                client.starttls(context=ssl.create_default_context())
                client.ehlo()
            if smtp_username:
                client.login(smtp_username, smtp_password)
            client.send_message(message)
    except Exception as exc:  # pragma: no cover
        return {
            "status": "failed",
            "detail": str(exc),
        }

    return {
        "status": "sent",
        "detail": f"Email alert sent to {len(recipients)} recipient(s).",
        "recipient_count": len(recipients),
    }


def _channel_result(channel: str, configured: bool, status: str, detail: str, **extra: Any) -> dict[str, Any]:
    return {
        "channel": channel,
        "configured": configured,
        "status": status,
        "detail": detail,
        **extra,
    }


def fan_out_alert(
    event: dict[str, Any],
    workspace_settings: dict[str, Any] | None = None,
    *,
    channels: list[str] | tuple[str, ...] | None = None,
    dry_run: bool = False,
) -> dict[str, Any]:
    destinations = resolve_alert_destinations(workspace_settings)
    selected_channels = list(dict.fromkeys(channels or DEFAULT_CHANNELS))
    deliveries: list[dict[str, Any]] = []

    for channel in selected_channels:
        if channel == "dashboard":
            deliveries.append(
                _channel_result(
                    "dashboard",
                    True,
                    "ready" if dry_run else "sent",
                    "Alert remains visible in the control room.",
                )
            )
        elif channel == "n8n":
            if dry_run:
                deliveries.append(
                    _channel_result(
                        "n8n",
                        bool(destinations["n8n_webhook_url"]),
                        "ready" if destinations["n8n_webhook_url"] else "skipped",
                        destinations["n8n_webhook_url"] or "No n8n alert webhook URL is configured.",
                        url=destinations["n8n_webhook_url"] or None,
                    )
                )
            elif destinations["n8n_webhook_url"]:
                result = _post_json(destinations["n8n_webhook_url"], event)
                deliveries.append(
                    _channel_result(
                        "n8n",
                        True,
                        result["status"],
                        result["detail"],
                        http_status=result.get("http_status"),
                        url=destinations["n8n_webhook_url"],
                    )
                )
            else:
                deliveries.append(
                    _channel_result("n8n", False, "skipped", "No n8n alert webhook URL is configured.")
                )
        elif channel == "webhook":
            if dry_run:
                deliveries.append(
                    _channel_result(
                        "webhook",
                        bool(destinations["webhook_url"]),
                        "ready" if destinations["webhook_url"] else "skipped",
                        destinations["webhook_url"] or "No webhook destination configured.",
                        url=destinations["webhook_url"] or None,
                    )
                )
            elif destinations["webhook_url"]:
                result = _post_json(destinations["webhook_url"], event)
                deliveries.append(
                    _channel_result(
                        "webhook",
                        True,
                        result["status"],
                        result["detail"],
                        http_status=result.get("http_status"),
                        url=destinations["webhook_url"],
                    )
                )
            else:
                deliveries.append(
                    _channel_result("webhook", False, "skipped", "No webhook destination configured.")
                )
        elif channel == "email":
            if dry_run:
                deliveries.append(
                    _channel_result(
                        "email",
                        bool(destinations["email_to"]),
                        "ready" if destinations["email_to"] else "skipped",
                        ", ".join(destinations["email_to"]) or "No alert email recipients configured.",
                        recipient_count=len(destinations["email_to"]),
                    )
                )
            else:
                result = _send_email(event, destinations["email_to"])
                deliveries.append(
                    _channel_result(
                        "email",
                        bool(destinations["email_to"]),
                        result["status"],
                        result["detail"],
                        recipient_count=result.get("recipient_count", 0),
                    )
                )
        else:
            deliveries.append(
                _channel_result(channel, False, "skipped", "Unknown alert channel.")
            )

    statuses = {item["status"] for item in deliveries}
    if dry_run:
        overall_status = "dry-run"
    elif statuses == {"sent"}:
        overall_status = "sent"
    elif "failed" in statuses and "sent" in statuses:
        overall_status = "partial"
    elif "failed" in statuses:
        overall_status = "failed"
    else:
        overall_status = "skipped"

    return {
        "status": overall_status,
        "requested_channel_count": len(selected_channels),
        "delivery_count": len(deliveries),
        "deliveries": deliveries,
    }


def send_alert_event(
    event: dict[str, Any],
    workspace_settings: dict[str, Any] | None = None,
    *,
    channels: list[str] | tuple[str, ...] | None = None,
    dry_run: bool = False,
) -> dict[str, Any]:
    return {
        "event": event,
        "delivery": fan_out_alert(
            event,
            workspace_settings,
            channels=channels,
            dry_run=dry_run,
        ),
    }

"""
OpenClaw permission policy enforcement.

Every action OpenClaw takes is checked here first.
This module has no side effects — it only validates.
"""

TIER_PERMISSIONS: dict[int, set[str]] = {
    1: {"read_file", "query_state", "read_email", "read_project"},
    2: {"write_draft", "write_inbox_draft", "write_social_draft", "write_lead_draft"},
    3: {"write_approval_queue", "create_job", "update_job_status", "notify_operator"},
    4: {"organize_files", "write_session_template", "write_reascript", "write_soundflow_script"},
}

# These actions are PERMANENTLY blocked regardless of tier or approval state.
# Editing this set requires a code review and ADR update.
BLOCKLIST: frozenset[str] = frozenset({
    "send_email_without_approval",
    "post_social_without_approval",
    "execute_daw_script_without_approval",
    "delete_project_files",
    "modify_delivered_files",
    "access_financial_records",
    "bulk_email",
    "auto_archive_email",
    "auto_label_email",
})


def check_permission(action: str, tier: int) -> None:
    """
    Validate that an action is permitted at the given tier.

    Raises PermissionError if the action is blocked or not permitted.
    Call this before executing any action in OpenClaw.
    """
    if action in BLOCKLIST:
        raise PermissionError(
            f"Action '{action}' is permanently blocked by policy. "
            "No tier or approval can authorize this action."
        )
    allowed = set()
    for t in range(1, tier + 1):
        allowed |= TIER_PERMISSIONS.get(t, set())
    if action not in allowed:
        raise PermissionError(
            f"Action '{action}' is not permitted at tier {tier}. "
            f"Permitted actions at this tier: {sorted(allowed)}"
        )

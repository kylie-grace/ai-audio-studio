"""
Job status finite state machine.

This is the critical safety gate. All job status transitions must be
explicitly allowed here. Approval-required jobs cannot reach 'complete'
without passing through awaiting-approval → approved.
"""

ALLOWED_TRANSITIONS: dict[str, set[str]] = {
    "pending":           {"in-progress", "failed"},
    "in-progress":       {"awaiting-approval", "complete", "failed"},
    "awaiting-approval": {"approved", "rejected"},
    "approved":          {"in-progress", "complete"},
    "rejected":          set(),   # Terminal state — no further transitions
    "complete":          set(),   # Terminal state
    "failed":            {"pending"},  # Retry path only (subject to max_retries check)
}

TERMINAL_STATES = {"rejected", "complete"}


def validate_transition(
    current: str,
    next_status: str,
    approval_required: bool = True,
    retry_count: int = 0,
    max_retries: int = 3,
) -> None:
    """
    Validate a job status transition.

    Raises ValueError if the transition is not allowed.

    Additional constraints:
    - approval_required jobs cannot go from in-progress directly to complete.
    - failed → pending is blocked once retry_count >= max_retries.
    """
    allowed = ALLOWED_TRANSITIONS.get(current, set())
    if next_status not in allowed:
        raise ValueError(
            f"Illegal status transition: {current!r} → {next_status!r}. "
            f"Allowed next states: {sorted(allowed) or 'none (terminal)'}"
        )
    if approval_required and current == "in-progress" and next_status == "complete":
        raise ValueError(
            "Job has approval_required=True. Cannot move from 'in-progress' "
            "directly to 'complete'. Must pass through 'awaiting-approval' → 'approved'."
        )
    if current == "failed" and next_status == "pending":
        if retry_count >= max_retries:
            raise ValueError(
                f"Job has reached max_retries ({max_retries}). "
                "Cannot retry a job that has exceeded its retry limit."
            )


def is_terminal(status: str) -> bool:
    return status in TERMINAL_STATES

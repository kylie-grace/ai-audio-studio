"""
Approval boundary tests.

These tests verify that the FSM and approval policy correctly block
all unauthorized transitions. No test here should ever require changing
to make a feature work — if one fails, the safety model has been violated.
"""
import importlib.util
import os
import pytest

ROOT = os.path.join(os.path.dirname(__file__), "../..")


def _load(name: str, rel_path: str):
    """Load a module from a file path (works with hyphenated directory names)."""
    path = os.path.join(ROOT, rel_path)
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


fsm = _load("fsm", "services/project-state/src/fsm.py")
validate_transition = fsm.validate_transition
is_terminal = fsm.is_terminal

policy = _load("policy", "services/openclaw-orchestrator/src/policy.py")
check_permission = policy.check_permission


class TestFSMTransitions:
    def test_pending_to_in_progress_allowed(self):
        validate_transition("pending", "in-progress")

    def test_in_progress_to_awaiting_approval_allowed(self):
        validate_transition("in-progress", "awaiting-approval")

    def test_awaiting_approval_to_approved_allowed(self):
        validate_transition("awaiting-approval", "approved")

    def test_approved_to_complete_allowed(self):
        validate_transition("approved", "complete", approval_required=True)

    def test_approved_to_in_progress_allowed(self):
        # Re-queue after approval for multi-step workflows
        validate_transition("approved", "in-progress", approval_required=True)

    def test_failed_to_pending_allowed_within_limit(self):
        validate_transition("failed", "pending", retry_count=0, max_retries=3)

    def test_failed_to_pending_blocked_at_max_retries(self):
        with pytest.raises(ValueError, match="max_retries"):
            validate_transition("failed", "pending", retry_count=3, max_retries=3)

    def test_in_progress_to_complete_blocked_when_approval_required(self):
        with pytest.raises(ValueError, match="approval_required"):
            validate_transition("in-progress", "complete", approval_required=True)

    def test_in_progress_to_complete_allowed_when_no_approval_required(self):
        validate_transition("in-progress", "complete", approval_required=False)

    def test_rejected_is_terminal(self):
        with pytest.raises(ValueError):
            validate_transition("rejected", "pending")

    def test_complete_is_terminal(self):
        with pytest.raises(ValueError):
            validate_transition("complete", "in-progress")

    def test_pending_cannot_skip_to_complete(self):
        with pytest.raises(ValueError):
            validate_transition("pending", "complete")

    def test_pending_cannot_skip_to_approved(self):
        with pytest.raises(ValueError):
            validate_transition("pending", "approved")

    def test_is_terminal_complete(self):
        assert is_terminal("complete") is True

    def test_is_terminal_rejected(self):
        assert is_terminal("rejected") is True

    def test_is_terminal_pending(self):
        assert is_terminal("pending") is False

    def test_is_terminal_failed(self):
        # failed is NOT terminal — retry is allowed (subject to max_retries)
        assert is_terminal("failed") is False


class TestPolicyBlocklist:
    def test_send_email_without_approval_blocked(self):
        with pytest.raises(PermissionError, match="permanently blocked"):
            check_permission("send_email_without_approval", tier=4)

    def test_post_social_without_approval_blocked(self):
        with pytest.raises(PermissionError, match="permanently blocked"):
            check_permission("post_social_without_approval", tier=4)

    def test_execute_daw_script_without_approval_blocked(self):
        with pytest.raises(PermissionError, match="permanently blocked"):
            check_permission("execute_daw_script_without_approval", tier=4)

    def test_delete_project_files_blocked(self):
        with pytest.raises(PermissionError, match="permanently blocked"):
            check_permission("delete_project_files", tier=4)

    def test_bulk_email_blocked(self):
        with pytest.raises(PermissionError, match="permanently blocked"):
            check_permission("bulk_email", tier=4)

    def test_write_draft_allowed_at_tier_2(self):
        check_permission("write_draft", tier=2)  # should not raise

    def test_write_draft_not_allowed_at_tier_1(self):
        with pytest.raises(PermissionError):
            check_permission("write_draft", tier=1)

    def test_read_allowed_at_tier_1(self):
        check_permission("read_file", tier=1)

    def test_organize_files_allowed_at_tier_4(self):
        check_permission("organize_files", tier=4)

    def test_organize_files_not_allowed_at_tier_2(self):
        with pytest.raises(PermissionError):
            check_permission("organize_files", tier=2)

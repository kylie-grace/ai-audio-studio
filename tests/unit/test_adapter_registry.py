import os
import sys

ROOT = os.path.join(os.path.dirname(__file__), "../..")
SERVICE_ROOT = os.path.join(ROOT, "services/studio-worker")
sys.path.insert(0, SERVICE_ROOT)

from adapter_registry import get_adapter_for_daw, get_adapter_for_task_type, list_daw_adapters  # type: ignore  # noqa: E402


def test_list_daw_adapters_includes_all_expected_keys():
    adapters = list_daw_adapters()
    assert set(adapters.keys()) == {"reaper", "protools", "wavelab"}


def test_get_adapter_for_daw_returns_wavelab():
    adapter = get_adapter_for_daw("wavelab")
    assert adapter.capability() == "execute-wavelab"


def test_get_adapter_for_task_type_returns_soundflow():
    adapter = get_adapter_for_task_type("execute-soundflow")
    assert adapter.capability() == "execute-soundflow"

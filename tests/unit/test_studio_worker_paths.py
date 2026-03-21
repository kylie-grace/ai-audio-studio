import importlib.util
import os
from pathlib import Path

ROOT = os.path.join(os.path.dirname(__file__), "../..")
SERVICE_ROOT = os.path.join(ROOT, "services/studio-worker")

SPEC = importlib.util.spec_from_file_location("studio_worker_paths", os.path.join(SERVICE_ROOT, "paths.py"))
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)

translate_path = MODULE.translate_path


def test_translate_path_handles_windows_prefix_case_insensitively():
    translated = translate_path(
        r"z:\StudioShare\Projects\Song\Session\demo.rpp",
        '{"Z:\\\\StudioShare":"D:\\\\WorkerShare"}',
        "windows",
    )

    assert str(translated) == r"D:\WorkerShare\Projects\Song\Session\demo.rpp"


def test_translate_path_renders_windows_targets_from_posix_prefix():
    translated = translate_path(
        "/Volumes/StudioShare/projects/demo/song.wav",
        '{"/Volumes/StudioShare":"Z:\\\\StudioShare"}',
        "windows",
    )

    assert str(translated) == r"Z:\StudioShare\projects\demo\song.wav"

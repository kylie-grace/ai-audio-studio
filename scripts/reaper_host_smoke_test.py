#!/usr/bin/env python3
"""Run a host-side REAPER smoke test by dispatching a tiny ReaScript."""

from __future__ import annotations

import argparse
import json
import subprocess
import tempfile
import time
from pathlib import Path


DEFAULT_REAPER = Path("/Applications/REAPER.app/Contents/MacOS/REAPER")


def build_smoke_script(marker_path: Path) -> str:
    marker = str(marker_path).replace("\\", "\\\\")
    return f"""local marker_path = [[{marker}]]
local handle = io.open(marker_path, "w")
if handle then
  handle:write('{{"status":"ok","source":"reaper-smoke-test"}}')
  handle:close()
end
reaper.ShowConsoleMsg("ai-audio-studio smoke test executed\\n")
"""


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--reaper-binary", default=str(DEFAULT_REAPER))
    parser.add_argument("--timeout", type=float, default=10.0)
    args = parser.parse_args()

    binary = Path(args.reaper_binary)
    if not binary.exists():
        raise SystemExit(f"REAPER binary not found: {binary}")

    with tempfile.TemporaryDirectory(prefix="ai-audio-studio-reaper-smoke-") as tmpdir:
        temp_root = Path(tmpdir)
        marker_path = temp_root / "smoke-result.json"
        script_path = temp_root / "smoke_test.lua"
        script_path.write_text(build_smoke_script(marker_path))

        command = [str(binary), "-nonewinst", "-nosplash", "-noactivate", str(script_path)]
        completed = subprocess.run(command, capture_output=True, text=True, check=False, timeout=30)

        deadline = time.time() + args.timeout
        while time.time() < deadline:
            if marker_path.exists():
                result = json.loads(marker_path.read_text())
                print(
                    json.dumps(
                        {
                            "status": "ok",
                            "command": command,
                            "reaper_stdout": completed.stdout,
                            "reaper_stderr": completed.stderr,
                            "marker": result,
                        },
                        indent=2,
                    )
                )
                return 0
            time.sleep(0.25)

        print(
            json.dumps(
                {
                    "status": "failed",
                    "command": command,
                    "reaper_stdout": completed.stdout,
                    "reaper_stderr": completed.stderr,
                    "detail": "marker file was not written before timeout",
                },
                indent=2,
            )
        )
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

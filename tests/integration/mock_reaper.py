"""Mock REAPER helpers for integration tests.

The generated binary behaves like a tiny stand-in for REAPER:

- it accepts the same trailing session/script arguments as the adapter
- it reads a completion marker directive from the copied script
- it writes a JSON marker file and exits cleanly
"""

from __future__ import annotations

import json
from pathlib import Path
from textwrap import dedent


def build_reascript_source(marker_path: Path, label: str = "mock-reaper-flow") -> str:
    return dedent(
        f"""
        ; ai-audio-studio-completion-marker: {marker_path}
        ; ai-audio-studio-label: {label}
        reaper.ShowConsoleMsg("ai-audio-studio mock ReaScript executed\\n")
        """
    ).lstrip()


def write_mock_reaper_binary(binary_path: Path) -> Path:
    binary_path.parent.mkdir(parents=True, exist_ok=True)
    binary_path.write_text(
        dedent(
            """
            #!/usr/bin/env python3
            from __future__ import annotations

            import json
            import os
            import re
            import sys
            from pathlib import Path

            MARKER_DIRECTIVE = re.compile(r"^\\s*;\\s*ai-audio-studio-completion-marker:\\s*(.+?)\\s*$", re.M)

            def main() -> int:
                args = sys.argv[1:]
                if len(args) < 2:
                    print("expected session and script arguments", file=sys.stderr)
                    return 2

                session_path = Path(args[-2])
                script_path = Path(args[-1])
                if not session_path.exists():
                    print(f"missing session file: {session_path}", file=sys.stderr)
                    return 3
                if not script_path.exists():
                    print(f"missing script file: {script_path}", file=sys.stderr)
                    return 4

                marker_path = os.environ.get("AI_AUDIO_STUDIO_COMPLETION_MARKER")
                if not marker_path:
                    script_text = script_path.read_text()
                    match = MARKER_DIRECTIVE.search(script_text)
                    if not match:
                        print("missing completion marker directive", file=sys.stderr)
                        return 5
                    marker_path = match.group(1).strip()

                marker = Path(marker_path)
                marker.parent.mkdir(parents=True, exist_ok=True)
                marker.write_text(
                    json.dumps(
                        {
                            "status": "ok",
                            "source": "mock-reaper",
                            "session_path": str(session_path),
                            "script_path": str(script_path),
                            "argv": args,
                        },
                        indent=2,
                    )
                    + "\\n"
                )
                print("mock reaper completed")
                return 0

            if __name__ == "__main__":
                raise SystemExit(main())
            """
        ).lstrip()
    )
    binary_path.chmod(0o755)
    return binary_path


__all__ = ["build_reascript_source", "write_mock_reaper_binary"]

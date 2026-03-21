"""ReaScript Lua code generation library for AI Audio Studio.

All public functions return strings of Lua source code that can be assembled
into a complete, executable ReaScript (.lua) file.

Volume reference: Reaper D_VOL is a linear multiplier where 1.0 = 0 dB.
Pan reference: -1.0 = full left, 0.0 = centre, 1.0 = full right.
"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass, field
from textwrap import dedent
from typing import Any

# ---------------------------------------------------------------------------
# Data model for a single parsed change
# ---------------------------------------------------------------------------

@dataclass
class ParsedChange:
    element: str             # track name or "mix"
    parameter: str           # level | eq | reverb | compression | stereo_width | send_level | other
    direction: str           # up | down | adjust
    value_db: float | None   # absolute dB shift when known, else None
    confidence: float
    human_readable: str
    section: str = "full track"

    @classmethod
    def from_dict(cls, d: dict) -> "ParsedChange":
        return cls(
            element=d.get("element", "mix"),
            parameter=d.get("parameter", "other"),
            direction=d.get("direction", "adjust"),
            value_db=_coerce_db(d.get("value_db") or d.get("value")),
            confidence=float(d.get("confidence", 0.5)),
            human_readable=d.get("human_readable", ""),
            section=d.get("section", "full track"),
        )


def _coerce_db(v: Any) -> float | None:
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    if isinstance(v, str):
        m = re.search(r"[-+]?\d+(?:\.\d+)?", v)
        return float(m.group()) if m else None
    return None


# ---------------------------------------------------------------------------
# dB ↔ Reaper linear conversion
# ---------------------------------------------------------------------------

def db_to_reaper(db: float) -> float:
    """Convert dB to Reaper's linear D_VOL multiplier."""
    return 10 ** (db / 20.0)


def _direction_to_db(direction: str, value_db: float | None) -> float:
    """Choose a sensible dB delta when an explicit value is not provided."""
    if value_db is not None:
        return value_db
    return {"up": 2.0, "down": -2.0, "adjust": 0.0}.get(direction, 0.0)


# ---------------------------------------------------------------------------
# Lua helper block embedded once at the top of every script
# ---------------------------------------------------------------------------

_LUA_HELPERS = dedent("""\
    -- ── AI Audio Studio helpers ─────────────────────────────────────────────

    local function log(msg)
      reaper.ShowConsoleMsg(tostring(msg) .. "\\n")
    end

    --- Find a track by name (exact, then case-insensitive, then prefix).
    local function find_track(name)
      if not name or name == "" then return nil end
      local count = reaper.CountTracks(0)
      local lower = name:lower()
      local found = nil
      for i = 0, count - 1 do
        local t = reaper.GetTrack(0, i)
        local _, tname = reaper.GetTrackName(t)
        if tname == name then return t end
        if not found and tname:lower() == lower then found = t end
      end
      if found then return found end
      -- prefix / contains match
      for i = 0, count - 1 do
        local t = reaper.GetTrack(0, i)
        local _, tname = reaper.GetTrackName(t)
        if tname:lower():find(lower, 1, true) then return t end
      end
      log("WARNING: track not found: " .. name)
      return nil
    end

    --- Clamp a value between lo and hi.
    local function clamp(v, lo, hi) return math.max(lo, math.min(hi, v)) end

    --- Get current D_VOL of a track (returns 1.0 if track is nil).
    local function get_vol(track)
      if not track then return 1.0 end
      return reaper.GetMediaTrackInfo_Value(track, "D_VOL")
    end

    --- Get index of first FX whose name contains needle (case-insensitive).
    local function find_fx(track, needle)
      if not track then return -1 end
      local count = reaper.TrackFX_GetCount(track)
      local lower = needle:lower()
      for i = 0, count - 1 do
        local _, name = reaper.TrackFX_GetFXName(track, i, "")
        if name:lower():find(lower, 1, true) then return i end
      end
      return -1
    end

    -- ────────────────────────────────────────────────────────────────────────
""")

# ---------------------------------------------------------------------------
# Individual command generators
# ---------------------------------------------------------------------------

def rs_set_volume(track_name: str, db_delta: float, label: str = "") -> str:
    """Set track volume by adding db_delta to the current level."""
    linear = db_to_reaper(abs(db_delta))
    sign = "+" if db_delta >= 0 else "-"
    lbl = label or f"set volume {sign}{abs(db_delta):.1f} dB"
    return dedent(f"""\
        do -- {lbl}
          local t = find_track({_lua_str(track_name)})
          if t then
            local cur_vol = get_vol(t)
            local cur_db = 20 * math.log(math.max(cur_vol, 1e-9), 10)
            local new_db = clamp(cur_db + ({db_delta:.3f}), -60.0, 12.0)
            local new_vol = 10 ^ (new_db / 20)
            reaper.SetMediaTrackInfo_Value(t, "D_VOL", new_vol)
            log(string.format("VOL %s: %.1f dB + %.1f dB = %.1f dB",
              {_lua_str(track_name)}, cur_db, ({db_delta:.3f}), new_db))
          end
        end
    """)


def rs_set_volume_absolute(track_name: str, db: float, label: str = "") -> str:
    """Set track volume to an absolute dB value."""
    lbl = label or f"set volume to {db:.1f} dB"
    return dedent(f"""\
        do -- {lbl}
          local t = find_track({_lua_str(track_name)})
          if t then
            local new_vol = 10 ^ ({db:.3f} / 20)
            reaper.SetMediaTrackInfo_Value(t, "D_VOL", new_vol)
            log("VOL " .. {_lua_str(track_name)} .. " → {db:.1f} dB")
          end
        end
    """)


def rs_set_pan(track_name: str, pan_value: float, label: str = "") -> str:
    """Set track pan. pan_value: -1.0 (L) to 1.0 (R)."""
    clamped = max(-1.0, min(1.0, pan_value))
    lbl = label or f"set pan {clamped:+.2f}"
    return dedent(f"""\
        do -- {lbl}
          local t = find_track({_lua_str(track_name)})
          if t then
            reaper.SetMediaTrackInfo_Value(t, "D_PAN", {clamped:.3f})
            log("PAN " .. {_lua_str(track_name)} .. " → {clamped:+.2f}")
          end
        end
    """)


def rs_mute(track_name: str, mute: bool, label: str = "") -> str:
    """Mute or unmute a track."""
    val = 1 if mute else 0
    lbl = label or ("mute" if mute else "unmute")
    log_prefix = '"MUTE "' if mute else '"UNMUTE "'
    return dedent(f"""\
        do -- {lbl}
          local t = find_track({_lua_str(track_name)})
          if t then
            reaper.SetMediaTrackInfo_Value(t, "B_MUTE", {val})
            log({log_prefix} .. {_lua_str(track_name)})
          end
        end
    """)


def rs_add_fx(track_name: str, plugin_name: str, label: str = "") -> str:
    """Add an FX plugin to a track if not already present."""
    lbl = label or f"add FX {plugin_name}"
    return dedent(f"""\
        do -- {lbl}
          local t = find_track({_lua_str(track_name)})
          if t then
            local existing = find_fx(t, {_lua_str(plugin_name)})
            if existing < 0 then
              local idx = reaper.TrackFX_AddByName(t, {_lua_str(plugin_name)}, false, -1)
              if idx >= 0 then
                log("FX added: " .. {_lua_str(plugin_name)} .. " on " .. {_lua_str(track_name)})
              else
                log("WARNING: FX not found in plugin list: " .. {_lua_str(plugin_name)})
              end
            else
              log("FX already present: " .. {_lua_str(plugin_name)})
            end
          end
        end
    """)


def rs_enable_fx(track_name: str, plugin_name: str, enabled: bool, label: str = "") -> str:
    """Enable or bypass an FX on a track."""
    lbl = label or (f"enable {plugin_name}" if enabled else f"bypass {plugin_name}")
    lua_bool = "true" if enabled else "false"
    log_prefix = '"ENABLE FX: "' if enabled else '"BYPASS FX: "'
    return dedent(f"""\
        do -- {lbl}
          local t = find_track({_lua_str(track_name)})
          if t then
            local fx = find_fx(t, {_lua_str(plugin_name)})
            if fx >= 0 then
              reaper.TrackFX_SetEnabled(t, fx, {lua_bool})
              log({log_prefix} .. {_lua_str(plugin_name)})
            else
              log("WARNING: FX not found: " .. {_lua_str(plugin_name)})
            end
          end
        end
    """)


def rs_set_fx_param_by_name(
    track_name: str,
    plugin_name: str,
    param_name: str,
    value: float,
    label: str = "",
) -> str:
    """Set an FX parameter by name (searches for the param by name pattern)."""
    lbl = label or f"set {plugin_name}/{param_name} = {value}"
    return dedent(f"""\
        do -- {lbl}
          local t = find_track({_lua_str(track_name)})
          if t then
            local fx = find_fx(t, {_lua_str(plugin_name)})
            if fx >= 0 then
              local count = reaper.TrackFX_GetNumParams(t, fx)
              local lower_needle = {_lua_str(param_name.lower())}
              for p = 0, count - 1 do
                local _, pname = reaper.TrackFX_GetParamName(t, fx, p, "")
                if pname:lower():find(lower_needle, 1, true) then
                  reaper.TrackFX_SetParam(t, fx, p, {value:.4f})
                  log(string.format("FX PARAM %s/%s[%d] → {value:.4f}", {_lua_str(plugin_name)}, pname, p))
                  break
                end
              end
            end
          end
        end
    """)


def rs_add_marker(position: float, name: str, color: int = 0, label: str = "") -> str:
    """Add a project marker at the given position (seconds)."""
    lbl = label or f"add marker '{name}' at {position:.2f}s"
    return dedent(f"""\
        do -- {lbl}
          local proj, _ = reaper.EnumProjects(-1)
          reaper.AddProjectMarker2(proj, false, {position:.3f}, 0, {_lua_str(name)}, -1, {color})
          log("MARKER added: {name} at {position:.2f}s")
        end
    """)


def rs_add_region(start: float, end: float, name: str, label: str = "") -> str:
    """Add a project region."""
    lbl = label or f"add region '{name}'"
    return dedent(f"""\
        do -- {lbl}
          local proj, _ = reaper.EnumProjects(-1)
          reaper.AddProjectMarker2(proj, true, {start:.3f}, {end:.3f}, {_lua_str(name)}, -1, 0)
          log("REGION added: {name} [{start:.2f}–{end:.2f}s]")
        end
    """)


def rs_create_send(src_track: str, dst_track: str, level_db: float = 0.0, label: str = "") -> str:
    """Create a send from src_track to dst_track."""
    lbl = label or f"send {src_track} → {dst_track}"
    linear = db_to_reaper(level_db)
    return dedent(f"""\
        do -- {lbl}
          local src = find_track({_lua_str(src_track)})
          local dst = find_track({_lua_str(dst_track)})
          if src and dst then
            local send_idx = reaper.CreateTrackSend(src, dst)
            reaper.SetTrackSendInfo_Value(src, 0, send_idx, "D_VOL", {linear:.4f})
            log("SEND " .. {_lua_str(src_track)} .. " → " .. {_lua_str(dst_track)})
          end
        end
    """)


def rs_render(output_path: str, sample_rate: int = 48000, label: str = "") -> str:
    """Set render destination and execute a project render."""
    lbl = label or f"render to {output_path}"
    return dedent(f"""\
        do -- {lbl}
          local proj, _ = reaper.EnumProjects(-1)
          reaper.GetSetProjectInfo_String(proj, "RENDER_FILE", {_lua_str(output_path)}, true)
          reaper.GetSetProjectInfo(proj, "RENDER_SAMPLERATE", {sample_rate}, true)
          reaper.Main_OnCommand(41720, 0)  -- File: Render project to disk
          log("RENDER started → {output_path}")
        end
    """)


def rs_save_copy(output_path: str, label: str = "") -> str:
    """Save a copy of the current project to output_path."""
    lbl = label or f"save copy to {output_path}"
    return dedent(f"""\
        do -- {lbl}
          local proj, _ = reaper.EnumProjects(-1)
          reaper.Main_SaveProjectEx(proj, {_lua_str(output_path)}, 3)
          log("PROJECT COPY saved: {output_path}")
        end
    """)


def rs_write_completion_marker(marker_path: str) -> str:
    """Write a completion marker file so the adapter knows the script finished."""
    return dedent(f"""\
        do -- write completion marker
          local f = io.open({_lua_str(marker_path)}, "w")
          if f then
            f:write("done\\n")
            f:close()
            log("Completion marker written: {marker_path}")
          else
            log("WARNING: could not write completion marker: {marker_path}")
          end
        end
    """)


# ---------------------------------------------------------------------------
# High-level: translate a ParsedChange to Lua
# ---------------------------------------------------------------------------

# Map revision parser "element" aliases to likely Reaper track name patterns
_ELEMENT_ALIASES: dict[str, list[str]] = {
    "vocals": ["Lead Vocal", "Lead Vocals", "Vox", "Vocal", "Vocals", "BGV", "Lead Vox"],
    "kick": ["Kick", "Kick Drum", "BD", "Bass Drum"],
    "bass": ["Bass", "Electric Bass", "DI Bass", "Bass DI"],
    "snare": ["Snare", "Snare Top", "Snare Bottom", "Sn"],
    "synth": ["Synth", "Keys", "Keyboard", "Pad", "Pads"],
    "pads": ["Pad", "Pads", "Synth Pad", "String Pad"],
    "drums": ["Drums", "Drum Bus", "Drum Buss", "Drum Overhead", "Drum OH"],
    "guitar": ["Guitar", "GTR", "Electric Guitar", "Acoustic", "Ac. Guitar"],
    "piano": ["Piano", "Keys", "Keyboard"],
    "mix": [],  # affects master or overall
}

# Map parameter + direction to a Lua operation
def change_to_lua(change: ParsedChange, session_tracks: list[str] | None = None) -> str:
    """Convert a single ParsedChange to one or more Lua statements."""
    track_name = _resolve_track(change.element, session_tracks)
    db_delta = _direction_to_db(change.direction, change.value_db)
    label = change.human_readable

    if change.parameter == "level":
        if track_name:
            return rs_set_volume(track_name, db_delta, label=label)
        return f"-- SKIP level change (no track match for '{change.element}'): {label}\n"

    if change.parameter == "eq":
        # Can't apply EQ without knowing the plugin — add a marker instead
        return rs_add_marker(
            0.0,
            f"EQ: {label}",
            label=f"note EQ change: {label}",
        )

    if change.parameter == "reverb":
        # Add a marker flagging the reverb instruction for manual review
        return rs_add_marker(0.0, f"REVERB: {label}", label=f"note reverb change: {label}")

    if change.parameter == "compression":
        return rs_add_marker(0.0, f"COMP: {label}", label=f"note compression change: {label}")

    if change.parameter == "stereo_width":
        # Width changes require a specific plugin — mark for review
        return rs_add_marker(0.0, f"WIDTH: {label}", label=f"note stereo width change: {label}")

    if change.parameter == "send_level":
        return rs_add_marker(0.0, f"SEND: {label}", label=f"note send level change: {label}")

    # Generic fallback: insert a marker so Maggie can see it in Reaper
    return rs_add_marker(0.0, label, label=f"note: {label}")


def _resolve_track(element: str, session_tracks: list[str] | None) -> str | None:
    """Find the best matching track name from the session for the given element."""
    if not session_tracks:
        # Fall back to alias table first entry
        aliases = _ELEMENT_ALIASES.get(element.lower(), [])
        return aliases[0] if aliases else None

    lower_element = element.lower()
    # Exact match first
    for t in session_tracks:
        if t.lower() == lower_element:
            return t
    # Alias match
    for alias in _ELEMENT_ALIASES.get(lower_element, []):
        for t in session_tracks:
            if t.lower() == alias.lower():
                return t
    # Contains match
    for t in session_tracks:
        if lower_element in t.lower():
            return t
    return None


# ---------------------------------------------------------------------------
# Top-level script assembler
# ---------------------------------------------------------------------------

def build_reascript(
    changes: list[dict],
    session_manifest: dict | None = None,
    completion_marker_path: str | None = None,
    session_path: str | None = None,
) -> str:
    """Build a complete, executable ReaScript from a list of parsed change dicts."""
    session_tracks: list[str] | None = None
    if session_manifest:
        session_tracks = [t.get("name", "") for t in session_manifest.get("tracks", []) if t.get("name")]

    parsed = [ParsedChange.from_dict(c) for c in changes]
    executable = [p for p in parsed if p.confidence >= 0.65 and p.parameter != "other"]
    markers_only = [p for p in parsed if p.confidence < 0.65 or p.parameter == "other"]

    header_comment = "\n".join([
        "-- Generated by AI Audio Studio revision-parser",
        f"-- Session: {session_path or 'unknown'}",
        f"-- Changes: {len(executable)} executable, {len(markers_only)} marker-only",
        "",
    ])

    track_list_comment = ""
    if session_tracks:
        track_list_comment = (
            "-- Session tracks detected:\n"
            + "".join(f"--   {t}\n" for t in session_tracks[:20])
            + "\n"
        )

    blocks = [
        header_comment,
        track_list_comment,
        _LUA_HELPERS,
        "reaper.Undo_BeginBlock()\n",
        "log('AI Audio Studio: starting revision pass')\n\n",
    ]

    if executable:
        blocks.append("-- ── Executable changes ──────────────────────────────────────────────\n")
        for change in executable:
            blocks.append(change_to_lua(change, session_tracks))
            blocks.append("")

    if markers_only:
        blocks.append("-- ── Low-confidence / review markers ────────────────────────────────\n")
        for change in markers_only:
            blocks.append(
                rs_add_marker(0.0, f"REVIEW: {change.human_readable}",
                              label=f"low-confidence: {change.human_readable}")
            )
            blocks.append("")

    if completion_marker_path:
        blocks.append("-- ── Completion ─────────────────────────────────────────────────────\n")
        blocks.append(rs_write_completion_marker(completion_marker_path))

    blocks.append("\nreaper.Undo_EndBlock('AI Audio Studio revision pass', -1)\n")
    blocks.append("log('AI Audio Studio: revision pass complete')\n")

    return "\n".join(blocks)


# ---------------------------------------------------------------------------
# Utility
# ---------------------------------------------------------------------------

def _lua_str(s: str) -> str:
    """Wrap a Python string in a Lua string literal."""
    escaped = s.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n")
    return f'"{escaped}"'

# Task 070 — Revision Parser

## Purpose and Scope
Parse free-form revision notes from clients or engineers into structured,
parameterized change requests. Convert natural language like "vocals too quiet
in the chorus" into machine-readable objects that a SoundFlow macro or
ReaScript can execute — after human approval. **No audio changes execute
without engineer sign-off.**

## Dependencies
- Task 001 complete
- Task 040 complete
- Task 050 complete (project context available)
- Ollama PLANNER_MODEL available

## Files to Create or Modify
- `workers/revision-parser/main.py`
- `workers/revision-parser/parser.py` — LLM-based note parsing
- `workers/revision-parser/param_map.py` — maps element+parameter to DAW commands
- `workers/revision-parser/soundflow_generator.py` — generates SoundFlow JSON macro
- `workers/revision-parser/reascript_generator.py` — generates Lua ReaScript
- `workers/revision-parser/confidence_checker.py` — flags low-confidence changes
- `workers/revision-parser/requirements.txt`
- `workers/revision-parser/Dockerfile`
- `services/openclaw-orchestrator/prompts/revision-parse.txt`

## Input Contract
```
POST /parse-revisions
{
  "project_id": "uuid",
  "raw_notes": "Vocals are too quiet in the chorus. The kick feels muddy, needs more definition. Can we bring up the stereo width on the synth pads?",
  "daw": "reaper|protools",
  "session_path": "/data/projects/artist-x/session/artist-x.rpp"
}
```

## Parsed Change Object
```json
{
  "element": "vocals",
  "section": "chorus",
  "parameter": "level",
  "direction": "up",
  "value": null,
  "value_range": ["+1dB", "+3dB"],
  "confidence": 0.92,
  "human_readable": "Raise vocal level in chorus section by ~1-3 dB",
  "requires_clarification": false
}
```

## Confidence Thresholds
- **≥ 0.85**: Include in script, flag as high-confidence
- **0.65–0.84**: Include but mark "review suggested"
- **< 0.65**: Do NOT include in script — flag for engineer clarification

## Prompt Contract: revision-parse.txt
```
You are parsing revision notes from a music producer into structured mixing changes.

Raw notes: {{raw_notes}}
Project context: {{project_context}}

For each distinct change requested, output a JSON array of objects:
{
  "element": "the sound or instrument",
  "section": "song section if specified, or 'full track'",
  "parameter": "level|eq|compression|reverb|stereo_width|timing|other",
  "direction": "up|down|more|less|add|remove|adjust",
  "value": null or specific value if mentioned,
  "value_range": suggested range if no value given,
  "confidence": 0.0-1.0 how certain you are of intent,
  "human_readable": plain English summary of this change,
  "requires_clarification": true if ambiguous
}

Output ONLY valid JSON array. No prose.
```

## Parameter Map (param_map.py — deterministic)
Maps `(element, parameter)` → DAW-specific command or track naming convention:
```python
PARAM_MAP = {
    ("vocals", "level"):         {"reaper": "track_volume", "protools": "track_fader"},
    ("kick", "eq"):              {"reaper": "track_eq", "protools": "dyn3_eq"},
    ("synth", "stereo_width"):   {"reaper": "stereo_width_plugin", "protools": "trim_plugin"},
    # ... extend as studio's plugin chains are documented
}
```

## SoundFlow / ReaScript Generation
Only generates scripts for changes with confidence ≥ 0.85 and known parameter maps.
Scripts are written to `revisions.soundflow_script` and `revisions.reascript_path`.
Scripts are NOT executed — they are queued for engineer approval.

## Acceptance Tests
1. Simple note ("vocals too quiet") → confidence ≥ 0.85, clear parsed change
2. Ambiguous note ("something feels off") → confidence < 0.65, flagged for clarification
3. Multi-part notes → multiple parsed change objects
4. ReaScript generated and stored in revisions table
5. Job status = `awaiting-approval` — script not executed
6. Engineer approves → job moves to `approved`
7. Engineer rejects → job terminal, notes written to project
8. Low-confidence changes never appear in generated scripts
9. Parsed changes viewable in Studio Brain UI revision review panel

## Definition of Done
Raw revision text in → structured change objects out → SoundFlow/ReaScript
generated → queued for engineer approval → nothing executed without explicit
sign-off. Audit log at Tier 2 (draft) for parsing, Tier 3 (queue) for script.

# Task 050 — Session Prep Worker

## Purpose and Scope
Build the session preparation pipeline. Watches for incoming stems in the
shared volume, validates them (sample rate, bit depth, clipping, naming),
organizes them into a project folder structure, generates a session template
for REAPER or Pro Tools, and produces a prep report for engineer review.
This is **Tier 4 (narrow approved automation)** — file organization is
pre-approved; no engineer decision is made automatically.

## Dependencies
- Task 001 complete
- Task 040 complete
- Shared volume mounted and accessible
- WATCHED_STEMS_PATH configured in env
- `ffprobe` available in audio-qc container (or install in session-prep)

## Files to Create or Modify
- `workers/session-prep/main.py`
- `workers/session-prep/file_watcher.py` — watches WATCHED_STEMS_PATH
- `workers/session-prep/validator.py` — stem validation logic
- `workers/session-prep/organizer.py` — creates standard folder structure
- `workers/session-prep/report_generator.py` — produces HTML/JSON prep report
- `workers/session-prep/reaper_template.py` — generates .RPP session file
- `workers/session-prep/requirements.txt`
- `workers/session-prep/Dockerfile`
- `services/n8n/workflows/session-prep-filewatch.json`

## Stem Validation Rules (validator.py)
All checks are deterministic. No LLM involvement.

| Check | Pass Condition | Severity if fail |
|-------|---------------|-----------------|
| Sample rate | 44100 or 48000 Hz (warn), 88200 or 96000 Hz (ideal) | WARNING |
| Bit depth | 24-bit or 32-bit float | WARNING |
| Duration match | All stems within ±1 sample of longest | ERROR |
| Clipping | True peak < -0.3 dBFS | WARNING |
| Naming | No spaces, no special chars, has track number prefix | INFO |
| Channel count | Mono or stereo only | WARNING if multi |
| File format | WAV or AIFF only | ERROR |

## Standard Folder Structure (organizer.py)
```
/data/projects/{project_slug}/
├── stems/
│   ├── 01-kick.wav
│   ├── 02-snare.wav
│   └── ...
├── session/
│   ├── {project_slug}.rpp   ← REAPER session
│   └── {project_slug}_template_notes.txt
├── reference/               ← client-provided references
├── deliveries/              ← output files go here
└── prep-report.html         ← engineer reads this
```

## Prep Report Contents
1. Stem inventory table (name, sample rate, bit depth, duration, status)
2. Issues list (severity: ERROR/WARNING/INFO, affected stem, message)
3. Recommended session settings (sample rate to use, template suggested)
4. Any stems needing engineer decision before mixing can begin
5. Sign-off checkbox section (printed or digital)

## Acceptance Tests
1. Drop valid WAV stems → organizer runs → folder structure created
2. Stems with mixed sample rates → WARNING in report, session prep continues
3. Mismatched durations (>1 sample) → ERROR, `session_manifests.status = issues-found`
4. Non-WAV/AIFF file in stems folder → ERROR, file left in place (not moved)
5. Prep report generated at `/data/projects/{slug}/prep-report.html`
6. Job in `jobs` table with `module = session-prep`, `status = awaiting-approval`
7. Engineer reviews report → approves → job moves to `approved`
8. No DAW launched, no audio processed — this worker only organizes and reports

## Definition of Done
Stems land in watched folder → validated → organized → REAPER session template
generated → prep report written → engineer notified via approval queue.
Worker never makes mixing decisions. Audit log at Tier 4 (narrow auto).

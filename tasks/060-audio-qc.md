# Task 060 — Audio QC Worker

## Purpose and Scope
Build the audio QC pipeline. Runs objective measurements on rendered audio
files (integrated LUFS, true peak, clipping, phase/mono correlation, sample
rate, bit depth) against target thresholds. Produces a structured QC report.
Blocks delivery if hard failures are present. **Never modifies audio files.**

## Dependencies
- Task 001 complete
- Task 040 complete
- Task 050 complete (session manifests table exists)
- `ffprobe`, `pyloudnorm`, `soundfile` available in `audio-qc` container
- Shared volume accessible

## Files to Create or Modify
- `services/audio-qc/src/main.py` — FastAPI app
- `services/audio-qc/src/analyzer.py` — runs all checks, returns structured results
- `services/audio-qc/src/checks/loudness.py` — LUFS and true peak
- `services/audio-qc/src/checks/clipping.py` — sample-level clipping detection
- `services/audio-qc/src/checks/phase.py` — mono compatibility and phase correlation
- `services/audio-qc/src/checks/format.py` — sample rate, bit depth, duration
- `services/audio-qc/src/report.py` — generates HTML and JSON QC report
- `services/audio-qc/src/thresholds.py` — configurable pass/fail thresholds
- `services/audio-qc/requirements.txt`
- `services/audio-qc/Dockerfile`
- `tests/unit/test_audio_qc.py`

## API Surface

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | `{"status":"ok"}` |
| POST | `/qc/run` | Run QC on a file, returns report |
| GET | `/qc/reports/{project_id}` | All QC reports for a project |
| GET | `/qc/reports/{report_id}` | Single report detail |

## QC Thresholds (thresholds.py — configurable per delivery target)

| Target | Integrated LUFS | True Peak | Notes |
|--------|----------------|-----------|-------|
| Streaming (Spotify/Apple) | -14 LUFS ± 1 | -1.0 dBFS | Most common |
| YouTube | -14 LUFS ± 1 | -1.0 dBFS | |
| CD / Download | -9 to -11 LUFS | -0.3 dBFS | Louder, limited |
| Club / DJ | -6 to -8 LUFS | -0.1 dBFS | Very loud |
| Broadcast | -23 LUFS ± 0.5 | -3.0 dBFS | Strict |

All thresholds are configurable in `thresholds.py`. Defaults are streaming.

## Check Severity Levels
- **HARD_FAIL**: Clipping above threshold, true peak over hard limit → blocks delivery
- **WARN**: LUFS outside target range, mono issues → passes QC but flagged for engineer
- **INFO**: Informational only (sample rate, bit depth stats)

## Report Structure (qc_reports table + HTML)
```json
{
  "overall_pass": true,
  "checks": [
    {
      "check": "integrated_lufs",
      "value": -13.8,
      "target": -14.0,
      "tolerance": 1.0,
      "pass": true,
      "message": "Within target range"
    },
    {
      "check": "true_peak",
      "value": -0.8,
      "threshold": -1.0,
      "pass": true,
      "message": "Below true peak ceiling"
    },
    {
      "check": "clipping",
      "detected": false,
      "pass": true
    },
    {
      "check": "mono_compatibility",
      "correlation": 0.87,
      "pass": true,
      "message": "Good mono compatibility"
    }
  ]
}
```

## Acceptance Tests
1. Run QC on a known-good WAV → `overall_pass = true`, all checks green
2. Run on a clipped file → `HARD_FAIL`, `overall_pass = false`, delivery blocked
3. Run on a loud mix (-8 LUFS) against streaming target → WARN, not HARD_FAIL
4. Run on a phase-cancelled file → mono_compatibility WARN
5. Report saved to `qc_reports` table and HTML file at project path
6. `POST /qc/run` with missing file path → HTTP 422
7. `POST /qc/run` with inaccessible file → HTTP 404 with clear error
8. QC worker never writes to the audio file — read-only

## Definition of Done
Any rendered audio file can be submitted to `/qc/run`. Report generated
in under 30 seconds for files up to 10 minutes. Results visible in project
state and Studio Brain UI. Hard failures block delivery job from proceeding.
Audit log at Tier 1 (read only — no mutations to audio).

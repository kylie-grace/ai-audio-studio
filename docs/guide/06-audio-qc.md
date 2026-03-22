# Audio QC — Understanding Measurements and Reports

**Written for:** Studio Owner/Operator, Guest Engineer
**Requires:** DAW profile enabled (`--profile daw`)

---

## What Audio QC Measures

The Audio QC service runs objective measurements on rendered audio files. These measurements tell you whether a render meets technical specifications before delivery. They don't tell you if it sounds good — that's your job — but they catch technical problems that might not be obvious on first listen.

---

## The Six Measurements

### 1. LUFS Integrated (Loudness)

**What it is:** Loudness Units relative to Full Scale — the integrated average loudness of the entire track. The standard measurement for streaming platform delivery targets.

**Why it matters:** Streaming platforms normalize your audio to a target loudness. If you deliver too loud, the platform turns it down (and may introduce distortion). If you deliver too quiet, it gets turned up (and sounds thin compared to everything else).

**Common targets:**
- Spotify: -14 LUFS (target)
- Apple Music: -16 LUFS (target)
- YouTube: -13 to -15 LUFS
- CD/download: up to -9 LUFS (loudness-mastered)
- Podcast: -16 to -19 LUFS

**What the system checks:** The LUFS value against the threshold configured for the current effort level.

**Reading the result:**
- `-14.2 LUFS` — Right on target for streaming
- `-9.1 LUFS` — Very loud (typical of aggressive mastering). Will be turned down by streaming platforms.
- `-20.3 LUFS` — Quiet. Will be turned up by platforms, potentially exposing noise floor issues.

---

### 2. True Peak dBFS (Maximum Level)

**What it is:** The maximum sample-level peak in the file, measured in decibels relative to Full Scale. "True peak" uses inter-sample measurement — it catches peaks between samples that standard peak meters miss.

**Why it matters:** Inter-sample peaks above 0 dBFS cause clipping in D/A conversion and streaming encoding (especially MP3/AAC). The universal ceiling is **-1.0 dBTP** for streaming delivery.

**What the system checks:** Any true peak value above the configured threshold (default: -1.0 dBTP).

**Reading the result:**
- `-0.8 dBTP` — Passes. Under the ceiling.
- `-0.1 dBTP` — Borderline. Passes technically, but you're cutting it close.
- `+0.3 dBTP` — Fails. Over the ceiling. Will cause problems in encoding.

---

### 3. Clipping Detection

**What it is:** Detection of digital clipping — samples at exactly 0 dBFS, or consecutive samples at the ceiling (indicating the waveform hit the ceiling and was truncated).

**Why it matters:** True clipping is different from a true peak violation. Clipping means the audio was already distorted before you exported it. Even if you bring the level down, the distortion is baked into the audio.

**What the system checks:** Whether clipping is present anywhere in the file.

**Reading the result:**
- `clipping_detected: false` — No clipping. Good.
- `clipping_detected: true` — Clipping found. This usually means something in the signal chain went above 0 dBFS before your limiter (or the limiter was off). Fix the clip in the session, don't just turn down the master.

---

### 4. Phase Coherence (Stereo Correlation)

**What it is:** A measure of how well the left and right channels of a stereo file are correlated. A correlation of +1.0 means perfect mono compatibility (both channels identical). A correlation of 0 means uncorrelated (wide stereo). A correlation below 0 means phase cancellation — parts of the audio will disappear or be reduced in mono.

**Why it matters:** Radio, many clubs, Bluetooth speakers, phone speakers — all play mono. If your mix has phase problems, it can sound dramatically different or lose key elements in mono.

**What the system checks:** Whether phase correlation falls below the configured minimum (typically 0.0 — any positive correlation is acceptable, any negative is a problem).

**Reading the result:**
- `phase_ok: true, correlation: 0.72` — Good. Healthy stereo width, mono-compatible.
- `phase_ok: false, correlation: -0.15` — Problem. Summing to mono will cause cancellation.

**Common causes of phase problems:** Wide stereo processing on bass frequencies, hard panning plus phase-shifted double tracking, out-of-phase room mics, Mid/Side processing errors.

---

### 5. Mono Compatibility

**What it is:** A derived check from phase coherence. If phase correlation is above threshold AND the loudness difference between the stereo sum and the mono sum is acceptable, mono compatibility passes.

**Why it matters:** Phase coherence and mono compatibility are related but not identical. A file can be technically phase-coherent but still lose significant impact when summed to mono.

**Reading the result:**
- `mono_ok: true` — Passes mono compatibility test.
- `mono_ok: false` — Fails. Check your stereo width processing, especially on low frequencies.

---

### 6. Spectral Analysis

**What it is:** Two derived measurements:

- **Spectral Tilt** — the overall energy balance from low to high frequencies. A negative tilt means bass-heavy. A positive tilt means bright/airy. Most commercial music runs slightly negative.
- **Low-End Energy Ratio** — how much of the total energy sits in the sub/bass range (typically 20Hz–150Hz). Platform-dependent thresholds apply.

**Why it matters:** These don't produce pass/fail results by default — they're informational. But if your mix sounds great and the spectral analysis shows a dramatic tilt in an unexpected direction, it's useful diagnostic information.

---

## Effort Levels

The QC service runs at different strictness levels based on your `DEFAULT_EFFORT_LEVEL` setting (or per-project override):

| Level | Description | What gets checked |
|-------|-------------|------------------|
| 1 | Import only | Basic format validation only |
| 2 | Standard | LUFS, true peak, clipping (default) |
| 3 | Extended | + Phase coherence, mono compatibility |
| 4 | Full | + Spectral analysis, comparative QC |

---

## Reading a QC Report

QC reports are available in:
- Context tab → select project → QC Reports
- In the delivery packaging approval card (attached to the package)
- Via API: `GET http://localhost:8120/qc/reports`

A passing report looks like:
```json
{
  "overall_pass": true,
  "lufs_integrated": -14.2,
  "true_peak_dbfs": -0.8,
  "clipping_detected": false,
  "phase_ok": true,
  "mono_ok": true,
  "issues": []
}
```

A failing report:
```json
{
  "overall_pass": false,
  "lufs_integrated": -9.1,
  "true_peak_dbfs": 0.3,
  "clipping_detected": false,
  "phase_ok": true,
  "mono_ok": true,
  "issues": [
    "True peak +0.3 dBTP exceeds threshold of -1.0 dBTP",
    "LUFS -9.1 is above streaming target range of -16 to -11"
  ]
}
```

---

## Comparative QC

At effort level 4, you can run QC comparing a candidate render against a reference file:

```bash
curl -X POST http://localhost:8120/qc/run \
  -H "Content-Type: application/json" \
  -d '{
    "candidate_path": "/Volumes/StudioShare/renders/track-v3.wav",
    "reference_path": "/Volumes/StudioShare/renders/track-v2-approved.wav",
    "effort_level": 4
  }'
```

The comparative report shows how the candidate differs from the reference on every metric.

---

## After a QC Fail

When a render fails QC, the workflow is:

1. QC report appears in the Context tab with fail indicators
2. An alert appears in Operations if the fail is blocking a delivery
3. The concierge can explain what each failure means and suggest fixes

Common fixes:

**LUFS too loud** → reduce master bus gain or limiter ceiling, re-render

**True peak violation** → your limiter ceiling is set above -1.0 dBTP, or a peak slipped through; lower the limiter ceiling, re-render

**Clipping detected** → something in the chain before your limiter is clipping; find it and fix it at the source; lowering master output won't un-clip what's already distorted

**Phase fail** → check stereo enhancement plugins on master bus; check bass-frequency stereo widening; use a correlation meter on your master channel to find the problem before re-rendering

After fixing and re-rendering, drop the new file into the watched path or submit it manually to QC. A new QC report will be generated.

---

## After a QC Pass

When a render passes all checks for the current effort level:

- The QC report shows `overall_pass: true`
- The delivery packager can now assemble a delivery bundle for this render
- A delivery packaging approval card will appear in the Operations queue
- The render is linked to the project's QC history in the Context tab

QC passes are not permanent re-approvals — you still approve the delivery package separately. But the QC gate cannot be bypassed: if QC has not run and passed, delivery packaging cannot proceed.

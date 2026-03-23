"""Audio QC Service — objective measurements on rendered audio files."""

from __future__ import annotations

import json
import logging
import math
import os
import re
import time

try:
    from pythonjsonlogger import jsonlogger as _jl  # type: ignore[import]
    _h = logging.StreamHandler(); _h.setFormatter(_jl.JsonFormatter("%(asctime)s %(name)s %(levelname)s %(message)s", rename_fields={"asctime": "ts", "levelname": "level"})); logging.root.handlers = [_h]
except ImportError:
    logging.basicConfig(format="%(asctime)s %(name)s %(levelname)s %(message)s")
logging.root.setLevel(logging.INFO)
from contextlib import asynccontextmanager
from pathlib import Path

import asyncpg
import numpy as np
import pyloudnorm as pyln
import soundfile as sf
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from .review import compare_reports, summarize_report
from .thresholds import get_thresholds

_pool: asyncpg.Pool | None = None
_workspace_settings_cache: dict = {}
_workspace_settings_cache_ts: float = 0.0
WORKSPACE_SETTINGS_CACHE_TTL = 60.0


_SAFE_PATH_PART = re.compile(r"^[^\x00-\x1f/\\:*?\"<>|][^\x00-\x1f/\\:*?\"<>|]*$")


def _resolve_allowed_path(file_path: str) -> Path:
    """Return a path within SHARED_PROJECTS_PATH validated component by component.

    Accepts absolute paths that begin with SHARED_PROJECTS_PATH or relative
    paths. Each component is checked against a safe-character allowlist so
    no user-controlled data reaches a file-system operation un-validated.
    """
    allowed_base = Path(os.environ.get("SHARED_PROJECTS_PATH", "/data/projects")).resolve()
    base_str = str(allowed_base)
    # Normalise using pure string operations — do not call FS methods on user data
    norm = os.path.normpath(file_path)
    if norm == base_str:
        return allowed_base
    if os.path.isabs(norm):
        prefix = base_str + os.sep
        if not norm.startswith(prefix):
            raise HTTPException(status_code=400, detail="File path is outside the allowed directory")
        rel = norm[len(prefix):]
    else:
        rel = norm
    # Validate each component and reconstruct from the trusted base
    safe = allowed_base
    for part in rel.split(os.sep):
        if not part:
            continue
        if part in (".", "..") or not _SAFE_PATH_PART.match(part):
            raise HTTPException(status_code=400, detail="Invalid path component in file path")
        safe = safe / part
    return safe


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _pool
    _pool = await asyncpg.create_pool(os.environ["POSTGRES_DSN"], min_size=1, max_size=5)
    yield
    if _pool is not None:
        await _pool.close()


app = FastAPI(title="Audio QC Service", lifespan=lifespan)


async def get_pool() -> asyncpg.Pool:
    if _pool is None:
        raise RuntimeError("DB pool not initialized")
    return _pool


async def _get_workspace_settings(pool) -> dict:
    global _workspace_settings_cache, _workspace_settings_cache_ts
    if time.monotonic() - _workspace_settings_cache_ts < WORKSPACE_SETTINGS_CACHE_TTL:
        return _workspace_settings_cache
    row = await pool.fetchrow("SELECT * FROM workspace_settings WHERE singleton = TRUE")
    _workspace_settings_cache = dict(row) if row else {}
    _workspace_settings_cache_ts = time.monotonic()
    return _workspace_settings_cache


async def load_module_settings(pool: asyncpg.Pool) -> dict:
    row = await _get_workspace_settings(pool)
    if not row or not row.get("module_settings"):
        return {}
    value = row["module_settings"]
    return json.loads(value) if isinstance(value, str) else dict(value)


async def require_module_enabled(pool: asyncpg.Pool, module_key: str) -> dict:
    module_settings = (await load_module_settings(pool)).get(module_key, {})
    if not module_settings.get("enabled", True):
        raise HTTPException(status_code=423, detail=f"{module_key} disabled in workspace settings")
    return module_settings


class RunQCBody(BaseModel):
    project_id: str
    file_path: str
    target: str = "streaming"


class QCComparePreviewBody(BaseModel):
    candidate: dict
    reference: dict


def _bit_depth(subtype: str) -> int | None:
    digits = "".join(ch for ch in subtype if ch.isdigit())
    return int(digits) if digits else None


def _spectral_metrics(data: np.ndarray, sample_rate: int) -> tuple[float, float]:
    mono = data.mean(axis=1) if data.ndim > 1 else data
    if mono.size == 0:
        return 0.0, 0.0
    spectrum = np.abs(np.fft.rfft(mono))
    freqs = np.fft.rfftfreq(len(mono), d=1.0 / sample_rate)
    total_energy = float(np.sum(spectrum**2)) or 1e-9
    low_band = spectrum[(freqs >= 20) & (freqs <= 120)]
    high_band = spectrum[(freqs >= 2000) & (freqs <= 12000)]
    low_energy = float(np.sum(low_band**2)) if low_band.size else 0.0
    high_energy = float(np.sum(high_band**2)) if high_band.size else 0.0
    spectral_tilt_db = round(10.0 * math.log10((high_energy + 1e-9) / (low_energy + 1e-9)), 2)
    low_end_ratio = round(low_energy / total_energy, 4)
    return spectral_tilt_db, low_end_ratio


def _stereo_width(data: np.ndarray) -> float:
    if data.ndim < 2 or data.shape[1] < 2:
        return 0.0
    left = data[:, 0]
    right = data[:, 1]
    mid = (left + right) / 2.0
    side = (left - right) / 2.0
    mid_rms = float(np.sqrt(np.mean(np.square(mid)))) if mid.size else 0.0
    side_rms = float(np.sqrt(np.mean(np.square(side)))) if side.size else 0.0
    return round(side_rms / max(mid_rms, 1e-9), 3)


def analyze_audio(file_path: Path, target: str) -> dict:
    thresholds = get_thresholds(target)
    data, sample_rate = sf.read(file_path, always_2d=True)
    peak_linear = float(np.max(np.abs(data))) if data.size else 0.0
    true_peak_dbfs = 20.0 * math.log10(max(peak_linear, 1e-9))
    mono = data.mean(axis=1)
    meter = pyln.Meter(sample_rate)
    loudness = float(meter.integrated_loudness(mono))
    clipping_detected = peak_linear >= 1.0
    if data.shape[1] >= 2:
        corr = float(np.corrcoef(data[:, 0], data[:, 1])[0, 1])
        if math.isnan(corr):
            corr = 1.0
    else:
        corr = 1.0
    spectral_tilt_db, low_end_ratio = _spectral_metrics(data, sample_rate)
    stereo_width = _stereo_width(data)
    info = sf.info(file_path)

    checks = [
        {
            "check": "integrated_lufs",
            "value": round(loudness, 2),
            "target": thresholds.lufs_target,
            "tolerance": thresholds.lufs_tolerance,
            "pass": abs(loudness - thresholds.lufs_target) <= thresholds.lufs_tolerance,
            "severity": "WARN",
        },
        {
            "check": "true_peak",
            "value": round(true_peak_dbfs, 2),
            "threshold": thresholds.true_peak_ceiling,
            "pass": true_peak_dbfs <= thresholds.true_peak_ceiling,
            "severity": "HARD_FAIL",
        },
        {
            "check": "clipping",
            "detected": clipping_detected,
            "pass": not clipping_detected,
            "severity": "HARD_FAIL",
        },
        {
            "check": "mono_compatibility",
            "correlation": round(corr, 3),
            "pass": corr >= thresholds.min_correlation,
            "severity": "WARN",
        },
        {
            "check": "spectral_balance",
            "value": spectral_tilt_db,
            "pass": -18.0 <= spectral_tilt_db <= 6.0,
            "severity": "WARN",
        },
        {
            "check": "low_end_ratio",
            "value": low_end_ratio,
            "pass": 0.08 <= low_end_ratio <= 0.45,
            "severity": "WARN",
        },
        {
            "check": "stereo_width",
            "value": stereo_width,
            "pass": 0.05 <= stereo_width <= 1.6,
            "severity": "WARN",
        },
    ]
    issues = [check for check in checks if not check["pass"]]
    overall_pass = not any(check["severity"] == "HARD_FAIL" and not check["pass"] for check in checks)

    return {
        "overall_pass": overall_pass,
        "target": target,
        "checks": checks,
        "lufs_integrated": round(loudness, 2),
        "lufs_target": thresholds.lufs_target,
        "true_peak_dbfs": round(true_peak_dbfs, 2),
        "true_peak_ok": true_peak_dbfs <= thresholds.true_peak_ceiling,
        "clipping_detected": clipping_detected,
        "phase_ok": corr >= thresholds.min_correlation,
        "mono_ok": corr >= thresholds.min_correlation,
        "spectral_tilt_db": spectral_tilt_db,
        "low_end_ratio": low_end_ratio,
        "stereo_width": stereo_width,
        "duration_s": round(len(data) / sample_rate, 3),
        "sample_rate": sample_rate,
        "bit_depth": _bit_depth(info.subtype or ""),
        "issues": issues,
    }


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/status")
async def status():
    pool = await get_pool()
    module_settings = (await load_module_settings(pool)).get("audio_qc", {})
    report_count = await pool.fetchval("SELECT COUNT(*) FROM qc_reports")
    passing_reports = await pool.fetchval("SELECT COUNT(*) FROM qc_reports WHERE overall_pass = TRUE")
    return {
        "status": "ok",
        "module": "audio-qc",
        "enabled": module_settings.get("enabled", True),
        "settings": module_settings,
        "report_count": report_count,
        "passing_reports": passing_reports,
    }


@app.post("/qc/run", status_code=201)
async def run_qc(body: RunQCBody):
    pool = await get_pool()
    await require_module_enabled(pool, "audio_qc")
    project = await pool.fetchrow("SELECT id FROM projects WHERE id=$1", body.project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    file_path = _resolve_allowed_path(body.file_path)
    if not file_path.exists():  # lgtm[py/path-injection]
        raise HTTPException(status_code=404, detail="Audio file not found")
    report = analyze_audio(file_path, body.target)
    report_path = file_path.with_suffix(file_path.suffix + ".qc.json")
    report_path.write_text(json.dumps(report, indent=2))  # lgtm[py/path-injection]
    row = await pool.fetchrow(
        """INSERT INTO qc_reports
           (project_id, file_path, lufs_integrated, lufs_target, true_peak_dbfs, true_peak_ok,
            clipping_detected, phase_ok, mono_ok, duration_s, sample_rate, bit_depth, overall_pass,
            issues, report_path)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15)
           RETURNING *""",
        body.project_id,
        body.file_path,
        report["lufs_integrated"],
        report["lufs_target"],
        report["true_peak_dbfs"],
        report["true_peak_ok"],
        report["clipping_detected"],
        report["phase_ok"],
        report["mono_ok"],
        report["duration_s"],
        report["sample_rate"],
        report["bit_depth"],
        report["overall_pass"],
        json.dumps(report["issues"]),
        str(report_path),
    )
    return {"report_id": str(row["id"]), **report, "report_path": str(report_path)}


@app.get("/qc/reports/project/{project_id}")
async def get_project_reports(project_id: str):
    pool = await get_pool()
    rows = await pool.fetch(
        "SELECT * FROM qc_reports WHERE project_id=$1 ORDER BY created_at DESC",
        project_id,
    )
    return [dict(row) for row in rows]


@app.get("/qc/reports/{report_id}")
async def get_report(report_id: str):
    pool = await get_pool()
    row = await pool.fetchrow("SELECT * FROM qc_reports WHERE id=$1", report_id)
    if row is None:
        raise HTTPException(status_code=404, detail="QC report not found")
    return dict(row)


@app.post("/qc/compare-preview")
async def compare_preview(body: QCComparePreviewBody):
    pool = await get_pool()
    await require_module_enabled(pool, "audio_qc")
    candidate = body.candidate
    reference = body.reference
    return {
        "status": "preview",
        "candidate_summary": summarize_report(candidate),
        "reference_summary": summarize_report(reference),
        "comparison": compare_reports(candidate, reference),
    }

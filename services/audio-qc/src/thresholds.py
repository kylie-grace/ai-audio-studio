"""
QC thresholds per delivery target.

These are the pass/fail criteria for each check. All values are configurable.
Change targets here without touching check logic.
"""
from dataclasses import dataclass


@dataclass(frozen=True)
class QCThresholds:
    lufs_target: float        # Integrated LUFS target
    lufs_tolerance: float     # ± tolerance around target
    true_peak_ceiling: float  # Maximum true peak in dBFS (HARD FAIL if exceeded)
    clipping_ceiling: float   # Sample-level clipping threshold dBFS (HARD FAIL)
    min_correlation: float    # Minimum mono correlation (0-1, WARN if below)


# Delivery target presets
TARGETS: dict[str, QCThresholds] = {
    "streaming": QCThresholds(
        lufs_target=-14.0,
        lufs_tolerance=1.0,
        true_peak_ceiling=-1.0,
        clipping_ceiling=-0.1,
        min_correlation=0.5,
    ),
    "youtube": QCThresholds(
        lufs_target=-14.0,
        lufs_tolerance=1.0,
        true_peak_ceiling=-1.0,
        clipping_ceiling=-0.1,
        min_correlation=0.5,
    ),
    "cd_download": QCThresholds(
        lufs_target=-10.0,
        lufs_tolerance=1.5,
        true_peak_ceiling=-0.3,
        clipping_ceiling=-0.1,
        min_correlation=0.4,
    ),
    "club_dj": QCThresholds(
        lufs_target=-7.0,
        lufs_tolerance=1.5,
        true_peak_ceiling=-0.1,
        clipping_ceiling=0.0,
        min_correlation=0.3,
    ),
    "broadcast": QCThresholds(
        lufs_target=-23.0,
        lufs_tolerance=0.5,
        true_peak_ceiling=-3.0,
        clipping_ceiling=-0.1,
        min_correlation=0.6,
    ),
}

DEFAULT_TARGET = "streaming"


def get_thresholds(target: str = DEFAULT_TARGET) -> QCThresholds:
    if target not in TARGETS:
        raise ValueError(f"Unknown delivery target '{target}'. Known: {list(TARGETS)}")
    return TARGETS[target]

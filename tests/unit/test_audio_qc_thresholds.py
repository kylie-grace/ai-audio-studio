"""Unit tests for audio QC thresholds — no audio files needed."""
import pytest
import sys
sys.path.insert(0, "/app")

from services.audio_qc.src.thresholds import get_thresholds, TARGETS


class TestThresholds:
    def test_all_targets_loadable(self):
        for target in TARGETS:
            t = get_thresholds(target)
            assert t.lufs_target < 0
            assert t.true_peak_ceiling < 0
            assert 0 < t.min_correlation < 1

    def test_streaming_defaults(self):
        t = get_thresholds("streaming")
        assert t.lufs_target == -14.0
        assert t.true_peak_ceiling == -1.0

    def test_broadcast_strictest(self):
        streaming = get_thresholds("streaming")
        broadcast = get_thresholds("broadcast")
        assert broadcast.lufs_tolerance < streaming.lufs_tolerance
        assert broadcast.true_peak_ceiling < streaming.true_peak_ceiling

    def test_unknown_target_raises(self):
        with pytest.raises(ValueError, match="Unknown delivery target"):
            get_thresholds("unknown_platform")

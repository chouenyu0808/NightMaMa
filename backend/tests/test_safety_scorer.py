import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from services.safety_scorer import Segment, Weights, score_route, score_segment


def test_dark_segment_drags_down_route_score():
    well_lit = Segment(length_m=100, light_count=5, camera_count=2, store_count=1)
    pitch_black = Segment(length_m=100, light_count=0, camera_count=0, store_count=0)
    weights = Weights()

    score = score_route([well_lit, pitch_black], time_extra_min=0, weights=weights)

    assert score == score_segment(pitch_black, weights)


def test_time_penalty_reduces_score():
    segment = Segment(length_m=100, light_count=10, camera_count=0, store_count=0)
    fast = score_route([segment], time_extra_min=0)
    slow = score_route([segment], time_extra_min=10)

    assert slow < fast


def test_route_without_segments_raises():
    try:
        score_route([], time_extra_min=0)
    except ValueError:
        pass
    else:
        raise AssertionError("expected ValueError for empty route")


if __name__ == "__main__":
    test_dark_segment_drags_down_route_score()
    test_time_penalty_reduces_score()
    test_route_without_segments_raises()
    print("safety_scorer: all checks passed")

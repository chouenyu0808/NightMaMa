import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from services.safety_scorer import Segment, score_route, score_segment


def test_dark_segment_drags_down_route_score():
    well_lit = Segment(length_m=100, light_count=5, light_nearest_m=5, camera_count=2, camera_nearest_m=10, store_nearest_m=20)
    pitch_black = Segment(length_m=100, light_count=0, light_nearest_m=9999, camera_count=0, camera_nearest_m=9999, store_nearest_m=9999)

    score = score_route([well_lit, pitch_black])

    assert score == score_segment(pitch_black)


def test_closer_light_and_store_raise_score():
    far = Segment(length_m=100, light_count=1, light_nearest_m=200, camera_count=0, camera_nearest_m=9999, store_nearest_m=500)
    near = Segment(length_m=100, light_count=1, light_nearest_m=5, camera_count=0, camera_nearest_m=9999, store_nearest_m=20)

    assert score_segment(near) > score_segment(far)


def test_route_without_segments_raises():
    try:
        score_route([])
    except ValueError:
        pass
    else:
        raise AssertionError("expected ValueError for empty route")


if __name__ == "__main__":
    test_dark_segment_drags_down_route_score()
    test_closer_light_and_store_raise_score()
    test_route_without_segments_raises()
    print("safety_scorer: all checks passed")

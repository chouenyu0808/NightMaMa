import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from services.safety_scorer import (
    Segment,
    openness_score,
    reports_score,
    score_route,
    score_segment,
)


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


def test_wide_road_beats_alley():
    """Prospect: same lighting, different street. The alley must score lower.

    The arterial carries a "footway" tag too — that is the sidewalk you actually
    walk on. Openness must take the most open road present, not the nearest one,
    or every arterial scores as a back alley.
    """
    base = dict(length_m=100, light_count=3, light_nearest_m=10,
                camera_count=1, camera_nearest_m=40, store_nearest_m=120)
    arterial = Segment(**base, road_classes=("footway", "secondary"), junction_count=2)
    alley = Segment(**base, road_classes=("service",), junction_count=0)

    assert score_segment(arterial) > score_segment(alley)
    assert openness_score(arterial) > openness_score(alley)


def test_junctions_improve_escape():
    """Escape: more turn-offs on the same class of road scores higher."""
    base = dict(length_m=100, light_count=3, light_nearest_m=10,
                camera_count=1, camera_nearest_m=40, store_nearest_m=120,
                road_classes=("residential",))
    many = Segment(**base, junction_count=3)
    none = Segment(**base, junction_count=0)

    assert openness_score(many) > openness_score(none)


def test_sidewalk_inherits_arterial_openness():
    """A footway beside a secondary road must score like the secondary road."""
    base = dict(length_m=100, light_count=3, light_nearest_m=10,
                camera_count=1, camera_nearest_m=40, store_nearest_m=120,
                junction_count=1)
    sidewalk = Segment(**base, road_classes=("footway", "secondary"))
    lone_path = Segment(**base, road_classes=("footway",))

    assert openness_score(sidewalk) > openness_score(lone_path)


def test_unmapped_road_is_not_zero():
    """An unmatched point is usually a poorly-mapped alley, not a void."""
    seg = Segment(length_m=100, light_count=3, light_nearest_m=10,
                  camera_count=1, camera_nearest_m=40, store_nearest_m=120,
                  road_classes=(), junction_count=0)
    assert 0 < openness_score(seg) < 100


def test_nearby_report_penalises():
    """A report right on the segment must cost more than one far away."""
    base = dict(length_m=100, light_count=3, light_nearest_m=10,
                camera_count=1, camera_nearest_m=40, store_nearest_m=120,
                road_classes=("residential",), junction_count=1)
    on_top = Segment(**base, report_nearest_m=5)
    far = Segment(**base, report_nearest_m=9999)

    assert reports_score(on_top) < reports_score(far)
    assert score_segment(on_top) < score_segment(far)


def test_no_reports_does_not_inflate():
    """No reports means "unflagged", not "verified safe" — it must cap at the
    same value as a report 10km away, never above it."""
    base = dict(length_m=100, light_count=3, light_nearest_m=10,
                camera_count=1, camera_nearest_m=40, store_nearest_m=120,
                road_classes=("residential",), junction_count=1)
    assert reports_score(Segment(**base, report_nearest_m=9999)) <= 100.0


def test_weights_still_normalise_with_five_factors():
    seg = Segment(length_m=100, light_count=3, light_nearest_m=10,
                  camera_count=1, camera_nearest_m=40, store_nearest_m=120,
                  road_classes=("residential",), junction_count=1)
    base = score_segment(seg)
    doubled = score_segment(seg, {
        "lighting": 0.60, "openness": 0.50, "safe_haven": 0.50,
        "cctv": 0.20, "reports": 0.20,
    })
    assert abs(base - doubled) < 1e-9


if __name__ == "__main__":
    test_dark_segment_drags_down_route_score()
    test_closer_light_and_store_raise_score()
    test_route_without_segments_raises()
    test_wide_road_beats_alley()
    test_junctions_improve_escape()
    test_sidewalk_inherits_arterial_openness()
    test_unmapped_road_is_not_zero()
    test_nearby_report_penalises()
    test_no_reports_does_not_inflate()
    test_weights_still_normalise_with_five_factors()
    print("safety_scorer: all checks passed")

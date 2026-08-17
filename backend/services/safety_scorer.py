"""Route safety scoring — segment-based, worst-segment-wins.

Each ~75m segment gets three 0-100 sub-scores — Lighting, CCTV, Safe Haven —
each blending local density with proximity to the nearest one, then blended
by fixed weights into a segment score:

    Segment Score = Lighting*40% + CCTV*25% + Safe Haven*35%
    Route Score   = min(Segment Score for all segments)

The route score takes the worst segment (not the average) so one dark
stretch can't be hidden by an otherwise well-lit route.
"""
import math
from dataclasses import dataclass

LIGHTING_WEIGHT = 0.40
CCTV_WEIGHT = 0.25
SAFE_HAVEN_WEIGHT = 0.35

DEFAULT_WEIGHTS = {
    "lighting": LIGHTING_WEIGHT,
    "cctv": CCTV_WEIGHT,
    "safe_haven": SAFE_HAVEN_WEIGHT,
}

# ponytail: hand-picked reference/decay constants against Taipei's actual streetlight
# (145k) and CCTV (5k) coverage; revisit if real routes cluster near 0 or 100
LIGHT_DENSITY_REF_PER_100M = 3.0  # streetlight count per 100m considered "fully lit"
CAMERA_DENSITY_REF_PER_100M = 1.0
LIGHT_PROXIMITY_DECAY_M = 50.0
CAMERA_PROXIMITY_DECAY_M = 80.0
STORE_PROXIMITY_DECAY_M = 200.0


@dataclass
class Segment:
    length_m: float
    light_count: int
    light_nearest_m: float
    camera_count: int
    camera_nearest_m: float
    store_nearest_m: float


def _clamp(x: float) -> float:
    return max(0.0, min(100.0, x))


def _density_score(count: int, length_m: float, ref_per_100m: float) -> float:
    if length_m <= 0:
        return 0.0
    density = count / (length_m / 100)
    return _clamp(density / ref_per_100m * 100)


def _proximity_score(distance_m: float, decay_m: float) -> float:
    """100 right next to it, decaying toward 0 as distance grows."""
    return _clamp(100 * math.exp(-distance_m / decay_m))


def lighting_score(segment: Segment) -> float:
    return 0.6 * _density_score(segment.light_count, segment.length_m, LIGHT_DENSITY_REF_PER_100M) + 0.4 * _proximity_score(
        segment.light_nearest_m, LIGHT_PROXIMITY_DECAY_M
    )


def cctv_score(segment: Segment) -> float:
    return 0.6 * _density_score(segment.camera_count, segment.length_m, CAMERA_DENSITY_REF_PER_100M) + 0.4 * _proximity_score(
        segment.camera_nearest_m, CAMERA_PROXIMITY_DECAY_M
    )


def safe_haven_score(segment: Segment) -> float:
    return _proximity_score(segment.store_nearest_m, STORE_PROXIMITY_DECAY_M)


def score_segment(segment: Segment, weights: dict[str, float] | None = None) -> float:
    """Blend the three sub-scores. `weights` lets a user rebalance what matters to
    them (e.g. weight lighting higher); omitted keys fall back to the defaults.

    Weights are normalised so the result stays on the same 0-100 scale no matter
    what the caller passes — otherwise a user whose overrides sum to 2.0 would get
    scores near 200 and every route would read as "safe".
    """
    w = {**DEFAULT_WEIGHTS, **(weights or {})}
    total = w["lighting"] + w["cctv"] + w["safe_haven"]
    if total <= 0:
        w = DEFAULT_WEIGHTS
        total = 1.0

    return (
        w["lighting"] * lighting_score(segment)
        + w["cctv"] * cctv_score(segment)
        + w["safe_haven"] * safe_haven_score(segment)
    ) / total


def score_route(segments: list[Segment], weights: dict[str, float] | None = None) -> float:
    if not segments:
        raise ValueError("route must have at least one segment")
    return min(score_segment(s, weights) for s in segments)

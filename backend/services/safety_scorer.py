"""Route safety scoring — segment-based, worst-segment-wins (see prd.md Module 1).

    S_segment = w_light*light_density + w_camera*camera_density + w_store*store_density
    S_route   = min(S_segment for all segments) - w_time * log(1 + time_extra_min)

Density is counted per 100m so segment length doesn't bias the score, and the
route score takes the worst segment (not the average) so one dark stretch
can't be hidden by an otherwise well-lit route.
"""
import math
from dataclasses import dataclass


@dataclass
class Segment:
    length_m: float
    light_count: int
    camera_count: int
    store_count: int


@dataclass
class Weights:
    light: float = 1.0
    camera: float = 1.0
    store: float = 1.0
    time: float = 1.0


def _density_per_100m(count: int, length_m: float) -> float:
    if length_m <= 0:
        return 0.0
    return count / (length_m / 100)


def score_segment(segment: Segment, weights: Weights) -> float:
    return (
        weights.light * _density_per_100m(segment.light_count, segment.length_m)
        + weights.camera * _density_per_100m(segment.camera_count, segment.length_m)
        + weights.store * _density_per_100m(segment.store_count, segment.length_m)
    )


def score_route(segments: list[Segment], time_extra_min: float, weights: Weights | None = None) -> float:
    if not segments:
        raise ValueError("route must have at least one segment")
    weights = weights or Weights()
    worst_segment_score = min(score_segment(s, weights) for s in segments)
    time_penalty = weights.time * math.log(1 + max(time_extra_min, 0))
    return worst_segment_score - time_penalty

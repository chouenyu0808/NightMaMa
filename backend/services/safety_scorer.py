"""Route safety scoring — segment-based, worst-segment-wins.

Each ~75m segment gets five 0-100 sub-scores, blended by weight:

    Segment Score = Lighting*30% + Openness*25% + Safe Haven*25%
                  + CCTV*10% + Community Reports*10%
    Route Score   = min(Segment Score for all segments)

The route score takes the worst segment (not the average) so one dark
stretch can't be hidden by an otherwise well-lit route.

Why these weights (they were 40/25/35 lighting/CCTV/safe-haven before):

- Lighting stays the largest single factor but drops from 40%. Welsh et al.'s
  systematic review (21 studies, 1974-2021) found improved street lighting
  reduces crime ~14%. Notably night crime did not fall more than day crime,
  which argues the mechanism is community confidence rather than visibility —
  so raw lamp count is a weaker signal than it looks.

- Openness is new and takes 25%. Fisher & Nasar (1992) showed fear is driven
  by prospect (how far you can see), refuge (where an offender can hide) and
  escape (where you can run to). That is the best-evidenced model of night-time
  street fear, and nothing in the old scoring captured it: a 2m dead-end alley
  and a four-lane arterial can have identical lamp counts.

- CCTV drops from 25% to 10%. Welsh & Farrington measured roughly a 4% crime
  reduction — about a quarter of lighting's effect — yet it carried a quarter
  of the score.

- Community reports are new at 10%. Users' own "someone is following me" /
  "this alley is pitch black" reports are a direct measurement of felt fear in
  Taipei specifically, which no imported dataset gives us. They were already
  being collected and shown as map pins, but never fed into scoring.
"""
import math
from dataclasses import dataclass

LIGHTING_WEIGHT = 0.30
OPENNESS_WEIGHT = 0.25
SAFE_HAVEN_WEIGHT = 0.25
CCTV_WEIGHT = 0.10
REPORTS_WEIGHT = 0.10

DEFAULT_WEIGHTS = {
    "lighting": LIGHTING_WEIGHT,
    "openness": OPENNESS_WEIGHT,
    "safe_haven": SAFE_HAVEN_WEIGHT,
    "cctv": CCTV_WEIGHT,
    "reports": REPORTS_WEIGHT,
}

# Prospect proxy: how far you can see and be seen on this class of road.
# OSM highway tags, mapped to 0-100. A four-lane arterial scores high; a
# service alley or a flight of steps between buildings scores low.
ROAD_OPENNESS = {
    "motorway": 90, "trunk": 90, "primary": 85, "secondary": 78,
    "tertiary": 70, "unclassified": 58, "residential": 55,
    "living_street": 48, "pedestrian": 55, "road": 50,
    "track": 30, "service": 32, "footway": 35, "path": 22, "steps": 18,
}
# Unknown tag, or no road matched within the search radius at all. Deliberately
# low-but-not-zero: an unmatched point is usually an alley OSM maps poorly.
ROAD_OPENNESS_DEFAULT = 40

# Escape proxy: junctions within the sampling radius at which the score tops out.
#
# Deliberately a raw count, not a per-100m density. The caller counts junctions
# inside a radius around the segment midpoint — an area measure — so dividing it
# by the segment length would mix units and, on 75m segments, saturate at two
# junctions. Taipei's grid puts 1-4 junctions in that radius, so 4 keeps the
# score spread across the range that actually occurs.
JUNCTION_COUNT_REF = 4.0

# Community reports are a penalty, not a bonus: no reports nearby means "no
# evidence of a problem", not "verified safe". A report right on top of the
# segment removes essentially all of this sub-score.
REPORT_PROXIMITY_DECAY_M = 150.0

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

    # --- Prospect / Escape (Fisher & Nasar) ---
    # Every distinct OSM highway tag within the sampling radius, e.g.
    # ["footway", "secondary"]. Empty means nothing matched, which scores as
    # a narrow lane. See openness_score for why this is a list, not the
    # single nearest tag.
    road_classes: tuple[str, ...] = ()
    # Junctions within the sampling radius. More turn-offs = more escape routes.
    junction_count: int = 0

    # --- Community reports ---
    # Distance to the nearest user-submitted "this felt unsafe" report.
    # 9999 is the caller's sentinel for "none nearby".
    report_nearest_m: float = 9999.0


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


def openness_score(segment: Segment) -> float:
    """Prospect + escape, per Fisher & Nasar (1992).

    Prospect comes from the road class (how wide and exposed the street is) and
    escape from junction count (how often you can turn off it). Weighted 70/30
    toward prospect: an arterial with few side streets still feels far safer at
    night than a warren of narrow alleys, because you can see and be seen.

    Prospect takes the *most open* road within the radius, not the nearest one.
    A pedestrian walking down a major arterial is physically on the sidewalk,
    which OSM tags "footway" — and that sidewalk centreline sits closer to the
    route than the roadway centreline does. Taking the nearest tag therefore
    scored Taipei's widest arterials as if they were back alleys. What matters
    for prospect is the openness of the space you are standing in, and beside a
    four-lane road you have the four-lane road's sightlines whatever the
    footway is tagged as.

    Refuge (hiding places) is not modelled directly — OSM has no reliable tag
    for "wall you could be dragged behind". Road class partly stands in for it,
    since narrow service lanes are exactly where refuge is highest.
    """
    prospect = max(
        (ROAD_OPENNESS.get(c, ROAD_OPENNESS_DEFAULT) for c in segment.road_classes),
        default=ROAD_OPENNESS_DEFAULT,
    )
    escape = _clamp(segment.junction_count / JUNCTION_COUNT_REF * 100)
    return _clamp(0.7 * prospect + 0.3 * escape)


def reports_score(segment: Segment) -> float:
    """Community anxiety reports, as a penalty.

    Full marks when no report is anywhere near, falling toward 0 as one gets
    closer. Framing it this way matters: the absence of reports means nobody has
    flagged this street, not that it has been checked and cleared, so it must
    not be able to push a segment's score above what the physical factors say.
    """
    return _clamp(100 - _proximity_score(segment.report_nearest_m, REPORT_PROXIMITY_DECAY_M))


def score_segment(segment: Segment, weights: dict[str, float] | None = None) -> float:
    """Blend the five sub-scores. `weights` lets a user rebalance what matters to
    them (e.g. weight lighting higher); omitted keys fall back to the defaults.

    Weights are normalised so the result stays on the same 0-100 scale no matter
    what the caller passes — otherwise a user whose overrides sum to 2.0 would get
    scores near 200 and every route would read as "safe".
    """
    w = {**DEFAULT_WEIGHTS, **(weights or {})}
    total = sum(w[k] for k in DEFAULT_WEIGHTS)
    if total <= 0:
        w = DEFAULT_WEIGHTS
        total = 1.0

    return (
        w["lighting"] * lighting_score(segment)
        + w["openness"] * openness_score(segment)
        + w["safe_haven"] * safe_haven_score(segment)
        + w["cctv"] * cctv_score(segment)
        + w["reports"] * reports_score(segment)
    ) / total


def score_route(segments: list[Segment], weights: dict[str, float] | None = None) -> float:
    if not segments:
        raise ValueError("route must have at least one segment")
    return min(score_segment(s, weights) for s in segments)

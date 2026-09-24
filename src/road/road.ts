// A road is a straight strip for the spike. The centerline runs along +x.
// Lanes are indexed 0..laneCount-1 from the top edge (-y) downward.
// This module must NOT import anything from src/profiles/.

export interface Road {
  readonly lengthPx: number;
  readonly laneCount: number;
  readonly laneWidthPx: number;
  /** Positions along the road (x, in px) where pedestrians may legally cross. */
  readonly crossingsPx: readonly number[];
  /**
   * Drivable verge outside the carriageway, on each side.
   *
   * Added after T8, not in the original T2. CONTRACT C3 says "bring the car to a stop
   * at the roadside", and without a verge the only way to stop is inside a live lane.
   * Measured: a parked player left 33 vehicles stopped dead behind it and the
   * population climbing. Lane changing (T8) reduced that to 16 but did not remove it,
   * so C3's passive-observation phase would have shown every tester a jam caused by
   * their own parked car — in BOTH cities, making the two look more alike than they are.
   *
   * Traffic never uses the verge; only the player may.
   */
  readonly shoulderPx: number;
}

export const SPIKE_ROAD: Road = {
  // Was 12000. The player's top speed rose from 285 to 417 px/s, and the start moved
  // to 2600 for the wider sim window; 18000 keeps a full-throttle run on the road for
  // about the same ~40 s as before, so headless "driving" runs still mostly drive.
  lengthPx: 18000,
  laneCount: 2,
  laneWidthPx: 90,
  // Every 1500px. Three crossings (3000/6000/9000) left long stretches with none in
  // the simulated window, and since disciplined pedestrians only cross at a marked
  // point, Singapore simply produced no pedestrians there — 11 against Trivandrum's
  // 29 over the same run. That is a DENSITY difference between the profiles, which
  // C3 explicitly forbids as a way of telling the two cities apart.
  crossingsPx: Array.from({ length: 11 }, (_, i) => (i + 1) * 1500),
  shoulderPx: 26,
};

/** World-space y of the centre of a lane. Lane 0 is topmost. */
export function laneCenterY(road: Road, lane: number): number {
  return (lane + 0.5) * road.laneWidthPx;
}

/** World-space y of the boundary between lane and lane+1. */
export function laneBoundaryY(road: Road, lane: number): number {
  return (lane + 1) * road.laneWidthPx;
}

/** Which lane a given y falls in. Fractional part = position within the lane. */
export function laneAtY(road: Road, y: number): number {
  return y / road.laneWidthPx - 0.5;
}

export const roadWidthPx = (road: Road): number => road.laneCount * road.laneWidthPx;

/**
 * The 3D game's road: the same cross-section as SPIKE_ROAD, five times longer, so a
 * run is a real commute (6 km) rather than a 1 km test strip. Traffic is simulated in
 * a window around the player (SIM_MARGIN_PX), so length does not change density.
 * Crossings keep SPIKE_ROAD's 1500px spacing for the same density reason.
 */
export const COAST_ROAD: Road = {
  lengthPx: 60000,
  laneCount: 2,
  laneWidthPx: 90,
  crossingsPx: Array.from({ length: 39 }, (_, i) => (i + 1) * 1500),
  shoulderPx: 26,
};

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
  lengthPx: 12000,
  laneCount: 2,
  laneWidthPx: 90,
  crossingsPx: [3000, 6000, 9000],
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

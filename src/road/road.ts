// A road is a straight strip for the spike. The centerline runs along +x.
// Lanes are indexed 0..laneCount-1 from the top edge (-y) downward.
// This module must NOT import anything from src/profiles/.

export interface Road {
  readonly lengthPx: number;
  readonly laneCount: number;
  readonly laneWidthPx: number;
  /** Positions along the road (x, in px) where pedestrians may legally cross. */
  readonly crossingsPx: readonly number[];
}

export const SPIKE_ROAD: Road = {
  lengthPx: 12000,
  laneCount: 2,
  laneWidthPx: 90,
  crossingsPx: [3000, 6000, 9000],
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

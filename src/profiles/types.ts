// Describes HOW AGENTS BEHAVE. Knows nothing about road geometry.
// Must NOT import anything from src/road/.

export type VehicleKind = 'car' | 'auto' | 'bus' | 'bike';

/** Physical facts about a vehicle kind. Same in every city — a bus is long everywhere. */
export interface VehicleSpec {
  readonly lengthPx: number;
  readonly widthPx: number;
  /** Multiplier applied to the profile's desired speed. */
  readonly speedFactor: number;
  /** Multiplier applied to the profile's max acceleration. */
  readonly accelFactor: number;
}

export const VEHICLE_SPECS: Readonly<Record<VehicleKind, VehicleSpec>> = {
  car: { lengthPx: 46, widthPx: 22, speedFactor: 1.0, accelFactor: 1.0 },
  auto: { lengthPx: 34, widthPx: 20, speedFactor: 0.85, accelFactor: 1.15 },
  bus: { lengthPx: 96, widthPx: 28, speedFactor: 0.78, accelFactor: 0.55 },
  bike: { lengthPx: 26, widthPx: 12, speedFactor: 1.05, accelFactor: 1.35 },
};

export const VEHICLE_KINDS: readonly VehicleKind[] = ['car', 'auto', 'bus', 'bike'];

export interface Range {
  readonly mean: number;
  readonly stdDev: number;
}

export interface TrafficProfile {
  readonly id: string;
  readonly displayName: string;

  // ---- fleet composition. Values MUST sum to 1.0 (validated at load). ----
  readonly fleetMix: Readonly<Record<VehicleKind, number>>;
  /** Vehicles spawned per minute across the whole road. */
  readonly spawnRatePerMin: number;

  // ---- longitudinal: car-following ----
  /** px/sec. */
  readonly desiredSpeed: Range;
  /** px, bumper-to-bumper, at desired speed. */
  readonly followingDistance: Range;
  /** px. Hard floor; agents never intentionally close below this. */
  readonly minFollowingDistancePx: number;
  /** px/sec^2, positive magnitude. */
  readonly comfortableDecelPx: number;
  /** px/sec^2. */
  readonly maxAccelPx: number;

  // ---- lateral: lane discipline ----
  /** 0..1. 1 = never leaves lane centre. 0 = lane markings are decorative. */
  readonly laneDiscipline: number;
  /** px. Amplitude of idle wander around the lane centre. */
  readonly lateralDriftPx: number;
  /** Deliberate centreline crossings per vehicle per minute. C3 counts these. */
  readonly centerlineCrossPerMin: number;
  /** px/sec. How fast a vehicle moves sideways when changing lane. */
  readonly lateralSpeedPx: number;

  // ---- gap acceptance, overtaking, cutting in ----
  /** 0..1. Probability per second of attempting an overtake while blocked. */
  readonly overtakeUrgency: number;
  /** Multiple of own vehicle length. <1.0 means accepting gaps it does not fit in. */
  readonly minAcceptedGapFactor: number;
  /** 0..1. Probability an overtake ends by cutting in front rather than clearing fully. */
  readonly cutInAggression: number;
  /** 0..1. Probability of yielding when someone cuts in ahead. */
  readonly yieldProbability: number;

  // ---- pedestrians ----
  /** Pedestrians spawned per minute across the whole road. */
  readonly pedestrianRatePerMin: number;
  /** 0..1. Probability a pedestrian crosses away from a designated crossing. */
  readonly jaywalkProbability: number;
  /** px/sec. */
  readonly pedestrianSpeedPx: number;
  /** 0..1. Probability per second of stopping mid-road to wait for a gap. */
  readonly pedestrianHesitation: number;

  // ---- roadside disorder ----
  /** 0..1. Probability per vehicle per minute of stopping IN the roadway. */
  readonly roadsideStopPerMin: number;
  /** seconds. How long such a stop lasts. */
  readonly roadsideStopDurationSec: number;
}

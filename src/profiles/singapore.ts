import type { TrafficProfile } from './types';

export const SINGAPORE: TrafficProfile = {
  id: 'singapore',
  displayName: 'Singapore',
  fleetMix: { car: 0.72, auto: 0.0, bus: 0.16, bike: 0.12 },
  spawnRatePerMin: 118, // deliberately close to Trivandrum's 130 — see PLAN.md T3
  desiredSpeed: { mean: 178, stdDev: 12 },
  followingDistance: { mean: 58, stdDev: 8 },
  minFollowingDistancePx: 34,
  comfortableDecelPx: 210,
  maxAccelPx: 190,
  laneDiscipline: 0.97,
  lateralDriftPx: 2,
  centerlineCrossPerMin: 0.0, // C3 requires exactly zero
  lateralSpeedPx: 34,
  overtakeUrgency: 0.1,
  minAcceptedGapFactor: 2.2,
  cutInAggression: 0.02,
  yieldProbability: 0.92,
  pedestrianRatePerMin: 22,
  jaywalkProbability: 0.02,
  pedestrianSpeedPx: 46,
  pedestrianHesitation: 0.05,
  roadsideStopPerMin: 0.0,
  roadsideStopDurationSec: 0,
};

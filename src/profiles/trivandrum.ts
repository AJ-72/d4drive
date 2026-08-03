import type { TrafficProfile } from './types';

export const TRIVANDRUM: TrafficProfile = {
  id: 'trivandrum',
  displayName: 'Trivandrum',
  fleetMix: { car: 0.34, auto: 0.3, bus: 0.11, bike: 0.25 },
  spawnRatePerMin: 130,
  desiredSpeed: { mean: 170, stdDev: 55 },
  followingDistance: { mean: 26, stdDev: 14 },
  minFollowingDistancePx: 6,
  comfortableDecelPx: 340,
  maxAccelPx: 260,
  laneDiscipline: 0.18,
  lateralDriftPx: 16,
  centerlineCrossPerMin: 7.0,
  lateralSpeedPx: 70,
  overtakeUrgency: 0.55,
  minAcceptedGapFactor: 0.85, // < 1.0: takes gaps it does not fit in
  cutInAggression: 0.7,
  yieldProbability: 0.25,
  pedestrianRatePerMin: 26,
  jaywalkProbability: 0.85,
  pedestrianSpeedPx: 42,
  pedestrianHesitation: 0.35,
  roadsideStopPerMin: 0.9,
  roadsideStopDurationSec: 4.5,
};

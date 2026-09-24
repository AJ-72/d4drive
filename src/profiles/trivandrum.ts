import type { TrafficProfile } from './types';

// Tuned for a calm road with occasional surprises: fewer vehicles, most of them holding
// the left lane, and now and then a sudden cut-in or a stop in the road. The earlier
// tuning (130/min, 16px wander, 7 straddles/min) read as every vehicle jumping about.
export const TRIVANDRUM: TrafficProfile = {
  id: 'trivandrum',
  displayName: 'Trivandrum',
  fleetMix: { car: 0.34, auto: 0.3, bus: 0.11, bike: 0.25 },
  spawnRatePerMin: 72, // both directions together
  desiredSpeed: { mean: 170, stdDev: 32 },
  followingDistance: { mean: 26, stdDev: 14 },
  minFollowingDistancePx: 6,
  comfortableDecelPx: 340,
  maxAccelPx: 260,
  twoWay: true,
  highBeamProbability: 0.45,
  laneDiscipline: 0.6,
  lateralDriftPx: 3,
  centerlineCrossPerMin: 0.5,
  lateralSpeedPx: 42,
  overtakeUrgency: 0.35,
  minAcceptedGapFactor: 0.85, // < 1.0: takes gaps it does not fit in
  cutInAggression: 0.45,
  yieldProbability: 0.25,
  pedestrianRatePerMin: 20,
  jaywalkProbability: 0.85,
  pedestrianSpeedPx: 42,
  pedestrianHesitation: 0.35,
  roadsideStopPerMin: 0.5,
  roadsideStopDurationSec: 4.5,
};

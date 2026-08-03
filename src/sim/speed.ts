import { VEHICLE_SPECS, type TrafficProfile, type VehicleKind } from '../profiles/types';
import { clamp, gaussian, type Rng } from './rng';

/** Called ONCE per vehicle, at spawn. A vehicle's desired speed does not change over its life. */
export function rollDesiredSpeed(p: TrafficProfile, kind: VehicleKind, rng: Rng): number {
  const raw = gaussian(p.desiredSpeed.mean, p.desiredSpeed.stdDev, rng);
  // Clamp BEFORE applying the kind factor.
  // Trivandrum is mean 170 / stdDev 55: the lower tail reaches zero and negative.
  // Without this clamp a vehicle spawns permanently stationary in a live lane —
  // which looks like an intentional roadside stop and corrupts what C3 measures.
  const clamped = clamp(raw, 0.35 * p.desiredSpeed.mean, 1.9 * p.desiredSpeed.mean);
  // Kind factor applied LAST, so a bus is reliably slower than a car that drew the
  // same number. Applying it before the clamp would let a bus clamp back up to car speed.
  return clamped * VEHICLE_SPECS[kind].speedFactor;
}
